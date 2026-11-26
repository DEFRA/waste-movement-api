import { randomUUID } from 'node:crypto'
import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { insertWithRetry } from '#/common/data/insert-with-retry.js'
import { createMovementId } from '#/common/http/waste-tracking.js'
import { getClient } from '#/common/client.js'
import { getOrganisationId } from '#/common/organisation.js'
import { handleBetaRouteError } from '#/common/route-errors.js'
import { withPayloadChecks } from '#/common/validation/payload-checks.js'
import { wasteReferenceDataChecks } from '../checks/waste-reference-data-checks.js'

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
      const requestId = getTraceId() || randomUUID()
      const orgId = getOrganisationId(request)
      const client = getClient(request)
      const movementId = await createMovementId()

      // A retry finding the movementId stored is an earlier attempt that
      // succeeded; the first attempt finding it means it was minted twice.
      await insertWithRetry(
        version.logger,
        () =>
          version.movements.createMovementRecord(request.db, {
            movementId,
            orgId,
            ...client,
            requestId,
            payload: request.payload
          }),
        { movementId }
      )

      version.logger.info(
        { movementId },
        `Successfully created waste movement with id ${movementId}`
      )
      request.app.journey = [{ movementId }]

      return h
        .response({ data: { movementId }, validation: { warnings: [] } })
        .code(HTTP_STATUS.CREATED)
        .header('x-request-id', requestId)
        .message('Successfully created a waste movement')
    } catch (error) {
      return handleBetaRouteError(error)
    }
  }
})
