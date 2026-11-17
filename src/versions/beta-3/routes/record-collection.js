import { randomUUID } from 'node:crypto'
import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { notFound } from '@hapi/boom'
import { getOrganisationId } from '#/common/organisation.js'
import { handleBetaRouteError } from '#/common/route-errors.js'
import { toResponse } from '../data/mappers/collection.js'

export const recordCollection = (version) => ({
  method: 'POST',
  path: '/movements/{movementId}/collection',
  options: {
    description: 'Record the Collection for a Movement',
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
      const traceId = getTraceId() || randomUUID()
      const orgId = getOrganisationId(request)
      const movementRecord = await version.movements.getMovementRecord(
        request.db,
        movementId
      )

      if (!movementRecord) {
        return notFound('movementId not found')
      }

      const collection = await version.collections.createCollectionRecord(
        request.db,
        { movementId, orgId, traceId, payload: request.payload }
      )

      version.logger.info(
        { movementId },
        `Successfully created waste movement collection for movement ${movementId}`
      )
      request.app.journey = [{ movementId }]

      return h
        .response(toResponse(collection))
        .code(HTTP_STATUS.CREATED)
        .header('x-request-id', traceId)
        .message('Successfully created a waste movement collection')
    } catch (error) {
      return handleBetaRouteError(error)
    }
  }
})
