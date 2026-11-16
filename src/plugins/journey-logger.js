import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { createLogger } from '#/common/helpers/logging/logger.js'

const logger = createLogger()

// CDP's schema caps transaction.id at 256 characters
const MAX_ID_LENGTH = 256
// Bounds the lines written for one request, e.g. a rejected delivery listing
// a very long array of Movement IDs
const MAX_LINES_PER_STEP = 100

// Any 4xx or 5xx
const isFailure = (statusCode) => statusCode >= HTTP_STATUS.BAD_REQUEST

const asId = (value) =>
  typeof value === 'string' ? value.slice(0, MAX_ID_LENGTH) : undefined

const asIds = (values) =>
  Array.isArray(values) ? [...new Set(values.map(asId).filter(Boolean))] : []

/**
 * The Movement and Delivery IDs the handler set on request.app.journey, as
 * IDs, leaving out entries with neither.
 */
const entriesSetByHandler = (journey) =>
  journey
    .map(({ movementId, deliveryId } = {}) => ({
      movementId: asId(movementId),
      deliveryId: asId(deliveryId)
    }))
    .filter(({ movementId, deliveryId }) => movementId || deliveryId)

/**
 * The Movement and Delivery IDs in the request, for a step whose handler
 * didn't get far enough to set them (e.g. a validation error): the movementId
 * param, the payload's movementIds, or the deliveryId param with the
 * Movements delivered under it, looked up with the route's own
 * `findDeliveryMovementIds`.
 */
const entriesFromRequest = async (request) => {
  const { params, payload } = request
  const deliveryId = asId(params?.deliveryId)
  const movementIds = asIds([
    params?.movementId,
    ...(Array.isArray(payload?.movementIds) ? payload.movementIds : [])
  ])

  if (movementIds.length > 0 || !deliveryId) {
    return movementIds.map((movementId) => ({ movementId, deliveryId }))
  }

  const { findDeliveryMovementIds } = request.route.settings.app
  const deliveredIds = findDeliveryMovementIds
    ? asIds(await findDeliveryMovementIds(request.db, deliveryId))
    : []

  return deliveredIds.length > 0
    ? deliveredIds.map((movementId) => ({ movementId, deliveryId }))
    : [{ deliveryId }]
}

/** The Movement and Delivery IDs a journey step involves. */
const journeyEntries = (request) =>
  Array.isArray(request.app.journey)
    ? entriesSetByHandler(request.app.journey)
    : entriesFromRequest(request)

const describeIds = ({ movementId, deliveryId }) => {
  const parts = [
    movementId && `movement ${movementId}`,
    deliveryId && `delivery ${deliveryId}`
  ].filter(Boolean)

  return parts.length > 0 ? ` (${parts.join(', ')})` : ''
}

// The version the route was registered under, from its prefix: 'beta-3'
const routeVersion = (request) =>
  request.route.realm.modifiers.route.prefix?.slice(1)

// 'beta-3' -> 'Beta-3 ', to start a line with
const versionLabel = (version) =>
  version ? `${version.charAt(0).toUpperCase()}${version.slice(1)} ` : ''

const statusCodeOf = (response) =>
  response.isBoom ? response.output.statusCode : response.statusCode

/**
 * Logs one journey line, for one Movement and/or Delivery the step involves.
 *
 * @param {{ version?: string, action: string, response: object }} step
 * @param {{ movementId?: string, deliveryId?: string }} ids
 */
const logStep = ({ version, action, response }, { movementId, deliveryId }) => {
  const statusCode = statusCodeOf(response)
  const failed = isFailure(statusCode)
  const outcome = failed ? 'failure' : 'success'

  logger.info(
    {
      event: { action, outcome },
      ...(movementId && { 'transaction.id': movementId }),
      ...(deliveryId && { 'span.id': deliveryId }),
      ...(failed && {
        error: {
          code: String(statusCode),
          ...(response.isBoom && { message: response.message })
        }
      })
    },
    `${versionLabel(version)}${action}: ${outcome}${describeIds({ movementId, deliveryId })}`
  )
}

/**
 * Logs each waste movement journey step, on success and on failure
 * (including validation errors), so a Movement can be followed from creation
 * to receipt in OpenSearch.
 *
 * A route opts in by naming its step in its config, and its handler sets the
 * IDs it involves on success:
 *
 *   options: { app: { journeyStep: 'delivery-recorded' } }
 *   request.app.journey = [{ movementId, deliveryId }]
 *
 * A route with a deliveryId param also gives the lookup for the Movements
 * delivered under it, so a failure is logged against them too:
 *
 *   options: { app: { journeyStep, findDeliveryMovementIds: (db, id) => … } }
 *
 * One line is logged per Movement the step involves, in CDP allowlisted ECS
 * fields (cdp-documentation how-to/logging.md):
 * - transaction.id: the Movement ID (keyword-mapped, so dashboards filter on it)
 * - span.id: the Delivery ID (text only: searchable, not aggregatable)
 * CDP expects these two as flattened keys ("transaction.id"), unlike the
 * nested event and error objects; a nested transaction or span is dropped.
 * - event.action / event.outcome: the step and whether it succeeded
 * - error.code / error.message: the status and reason, on failure
 *
 * The lines carry no url.path or http.response.status_code, so dashboards
 * counting "request completed" lines don't count them too.
 */
export const journeyLogger = {
  plugin: {
    name: 'journey-logger',
    register(server) {
      server.ext('onPreResponse', async (request, h) => {
        const action = request.route?.settings?.app?.journeyStep
        if (!action) {
          return h.continue
        }

        const version = routeVersion(request)
        try {
          const step = { version, action, response: request.response }
          const entries = await journeyEntries(request)

          // A step with no IDs still gets its line
          const lines = entries.length > 0 ? entries : [{}]

          for (const ids of lines.slice(0, MAX_LINES_PER_STEP)) {
            logStep(step, ids)
          }
        } catch (error) {
          // Never fail the request because its journey line couldn't be logged
          const versionPrefix = version ? `${version} ` : ''
          logger.warn(
            { err: error },
            `Failed to log ${versionPrefix}journey step`
          )
        }

        return h.continue
      })
    }
  }
}
