import { randomUUID } from 'node:crypto'
import { HTTP_STATUS, backoffOptions } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { backOff } from 'exponential-backoff'
import { isDuplicateKeyError } from '#/common/data/duplicate-key.js'
import { createMovementId } from '#/common/http/waste-tracking.js'
import { getOrganisationId } from '#/common/organisation.js'
import { handleBetaRouteError } from '#/common/route-errors.js'
import { withPayloadChecks } from '#/common/validation/payload-checks.js'
import { wasteReferenceDataChecks } from '../checks/waste-reference-data-checks.js'

/**
 * Stores the movement, retrying a failed write. A retry that finds the
 * movementId already stored is the earlier attempt having succeeded after
 * all (e.g. its acknowledgement was lost), so it counts as success. The
 * first attempt finding it stored means the ID was minted twice, which is
 * not retried.
 */
const storeMovement = async ({ logger, movements }, db, movement) => {
  const options = backoffOptions(logger)
  let isRetry = false

  await backOff(
    async () => {
      try {
        await movements.createMovementRecord(db, movement)
      } catch (error) {
        if (isRetry && isDuplicateKeyError(error)) {
          logger.info(
            { movementId: movement.movementId },
            'Movement already stored by an earlier attempt'
          )
          return
        }
        throw error
      } finally {
        isRetry = true
      }
    },
    {
      ...options,
      retry: (error, attemptNumber) =>
        !isDuplicateKeyError(error) && options.retry(error, attemptNumber)
    }
  )
}

export const createMovement = (version) => ({
  method: 'POST',
  path: '/movements',
  options: {
    description: 'Create a Movement',
    app: { journeyStep: 'movement-created' },
    validate: {
      payload: withPayloadChecks(
        version.validators.request('creation/create-movement-request'),
        wasteReferenceDataChecks
      )
    },
    response: {
      status: {
        201: version.validators.response('creation/create-movement-response')
      }
    }
  },
  handler: async (request, h) => {
    try {
      const traceId = getTraceId() || randomUUID()
      const orgId = getOrganisationId(request)
      const movementId = await createMovementId()

      await storeMovement(version, request.db, {
        movementId,
        orgId,
        wasteItems: request.payload.wasteItems
      })
      const responseBody = {
        data: { movementId },
        validation: { warnings: [] }
      }

      version.logger.info(
        { movementId },
        `Successfully created waste movement with id ${movementId}`
      )
      request.app.journey = [{ movementId }]

      return h
        .response(responseBody)
        .code(HTTP_STATUS.CREATED)
        .header('x-request-id', traceId)
        .message('Successfully created a waste movement')
    } catch (error) {
      return handleBetaRouteError(error)
    }
  }
})
