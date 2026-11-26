import { randomUUID } from 'node:crypto'
import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { notFound } from '@hapi/boom'
import { insertOnce } from '#/common/data/insert-once.js'
import { getClient } from '#/common/client.js'
import { getOrganisationId } from '#/common/organisation.js'
import { handleBetaRouteError } from '#/common/route-errors.js'

export const recordCollection = (version) => ({
  method: 'POST',
  path: '/movements/{movementId}/collection',
  options: {
    description: 'Record the Collection for a Movement',
    notes:
      'Records the Collection for the given Movement. A Movement is collected once: the same request again succeeds without storing anything, and a different second Collection is a 409.',
    app: { journeyStep: 'collection-recorded' },
    validate: {
      payload: version.validators.request(
        'collection/record-collection-request'
      ),
      params: version.validators.request('collection/movement-id-params')
    },
    response: {
      status: {
        201: version.validators.response(
          'collection/record-collection-response'
        )
      }
    }
  },
  handler: async (request, h) => {
    const { movementId } = request.params

    try {
      const requestId = getTraceId() || randomUUID()
      const orgId = getOrganisationId(request)
      const client = getClient(request)
      const movementRecord = await version.movements.getMovementRecord(
        request.db,
        movementId
      )

      if (!movementRecord) {
        return notFound('movementId not found')
      }

      // A Movement's Collection is recorded once: the same request again
      // succeeds without storing anything, a different one is a 409
      await insertOnce(version.logger, {
        insert: () =>
          version.collections.createCollectionRecord(request.db, {
            movementId,
            orgId,
            ...client,
            requestId,
            payload: request.payload
          }),
        findStored: () =>
          version.collections.findCollectionRecord(request.db, movementId),
        request: { orgId, payload: request.payload },
        conflictMessage: `A collection has already been recorded for movement ID: ${movementId}`,
        context: { movementId }
      })

      version.logger.info(
        { movementId },
        `Successfully created waste movement collection for movement ${movementId}`
      )
      request.app.journey = [{ movementId }]

      return h
        .response({ data: null, validation: { warnings: [] } })
        .code(HTTP_STATUS.CREATED)
        .header('x-request-id', requestId)
        .message('Successfully created a waste movement collection')
    } catch (error) {
      return handleBetaRouteError(error)
    }
  }
})
