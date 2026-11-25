import { randomUUID } from 'node:crypto'
import { HTTP_STATUS, backoffOptions } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { badRequest } from '@hapi/boom'
import { backOff } from 'exponential-backoff'
import { createDeliveryId } from '#/common/http/waste-tracking.js'
import { getOrganisationId } from '#/common/organisation.js'
import { handleBetaRouteError } from '#/common/route-errors.js'
import { WASTE_TYPE } from '../checks/waste-type.js'

/**
 * Groups the submitted movements into deliveries: one minted Delivery for all
 * the non-hazardous movements, then one Delivery per hazardous movement whose
 * Delivery ID is its own Movement ID. A movement is hazardous when any of its
 * waste items declares hazardous properties.
 *
 * @param {string[]} movementIds - deduplicated, in submission order
 * @param {Map<string, { isHazardous: boolean }>} movementsById
 * @returns {Promise<{ deliveryId: string, movementIds: string[], wasteType: string }[]>}
 */
const splitIntoDeliveries = async (movementIds, movementsById) => {
  const isHazardousMovement = (movementId) =>
    movementsById.get(movementId).isHazardous
  const hazardousIds = movementIds.filter(isHazardousMovement)
  const nonHazardousIds = movementIds.filter((id) => !isHazardousMovement(id))

  const hazardousDeliveries = hazardousIds.map((movementId) => ({
    deliveryId: movementId,
    movementIds: [movementId],
    wasteType: WASTE_TYPE.HAZARDOUS
  }))

  if (nonHazardousIds.length === 0) {
    return hazardousDeliveries
  }

  return [
    {
      deliveryId: await createDeliveryId(),
      movementIds: nonHazardousIds,
      wasteType: WASTE_TYPE.NON_HAZARDOUS
    },
    ...hazardousDeliveries
  ]
}

/**
 * Looks up the submitted movements, by ID, with whether each is hazardous.
 * Any that don't exist reject the whole request.
 *
 * @param {object} version
 * @param {import('mongodb').Db} db
 * @param {string[]} movementIds - deduplicated
 * @returns {Promise<Map<string, { isHazardous: boolean }>>}
 */
const findDeliverableMovements = async (
  { logger, movements },
  db,
  movementIds
) => {
  const found = await movements.findMovements(db, movementIds)
  const movementsById = new Map(
    found.map((movement) => [movement.movementId, movement])
  )
  const missingMovementIds = movementIds.filter(
    (movementId) => !movementsById.has(movementId)
  )

  if (missingMovementIds.length > 0) {
    const message = `Movement ID(s) not recognised: ${missingMovementIds.join(', ')}`
    logger.error({ movementIds, missingMovementIds }, message)

    throw badRequest(message)
  }

  return movementsById
}

/**
 * @param {{ deliveryId: string, movementIds: string[], wasteType: string }[]} recordedDeliveries -
 * the stored documents, in order
 * @returns {object} the 201 response body
 */
const toResponseBody = (recordedDeliveries) => ({
  data: {
    deliveries: recordedDeliveries.map(
      ({ deliveryId, movementIds, wasteType }) => ({
        deliveryId,
        movementIds,
        wasteType
      })
    )
  },
  validation: { warnings: [] }
})

export const recordDelivery = (version) => ({
  method: 'POST',
  path: '/deliveries',
  options: {
    description: 'Record a Delivery',
    notes:
      'Records a Delivery and returns one Delivery for all non-hazardous Movements, plus one per hazardous Movement.',
    app: { journeyStep: 'delivery-recorded' },
    validate: {
      payload: version.validators.request('delivery/record-delivery-request')
    },
    response: {
      status: {
        201: version.validators.response('delivery/record-delivery-response')
      }
    }
  },
  handler: async (request, h) => {
    const { logger, deliveries } = version
    // A Movement ID submitted twice is only delivered once.
    const movementIds = [...new Set(request.payload.movementIds)]

    try {
      const requestId = getTraceId() || randomUUID()
      const orgId = getOrganisationId(request)

      const movementsById = await findDeliverableMovements(
        version,
        request.db,
        movementIds
      )
      const split = await splitIntoDeliveries(movementIds, movementsById)

      const recordedDeliveries = await backOff(
        () =>
          deliveries.createDeliveryRecords(
            request.db,
            request.mongoClient,
            { orgId, requestId, payload: request.payload },
            split
          ),
        backoffOptions(logger)
      )

      const deliveryIds = recordedDeliveries.map(({ deliveryId }) => deliveryId)
      logger.info(
        { deliveryIds },
        `Successfully recorded deliveries with ids ${deliveryIds.join(', ')}`
      )
      request.app.journey = recordedDeliveries.flatMap(
        ({ deliveryId, movementIds: deliveredIds }) =>
          deliveredIds.map((movementId) => ({ movementId, deliveryId }))
      )

      return h
        .response(toResponseBody(recordedDeliveries))
        .code(HTTP_STATUS.CREATED)
        .header('x-request-id', requestId)
        .message('Successfully recorded a delivery')
    } catch (error) {
      return handleBetaRouteError(error)
    }
  }
})
