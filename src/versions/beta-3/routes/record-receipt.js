import { randomUUID } from 'node:crypto'
import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { notFound } from '@hapi/boom'
import { getOrganisationId } from '#/common/organisation.js'
import { handleBetaRouteError } from '#/common/route-errors.js'
import { withPayloadChecks } from '#/common/validation/payload-checks.js'
import {
  emptyIsNotProvided,
  notInFuture
} from '#/common/validation/date-time-checks.js'

const receiptDateTime = ['receiptDateTime']

export const recordReceipt = (version) => ({
  method: 'POST',
  path: '/deliveries/{deliveryId}/receipt',
  options: {
    description: 'Record receipt of waste against a Delivery',
    notes: 'Records receipt of the waste delivered under the given Delivery.',
    app: {
      journeyStep: 'receipt-recorded',
      // So a rejected receipt is logged against the delivered Movements too
      findDeliveryMovementIds: (db, deliveryId) =>
        version.deliveries.findDeliveryMovementIds(db, deliveryId)
    },
    validate: {
      payload: withPayloadChecks(
        version.validators.request('receipt/record-receipt-request'),
        emptyIsNotProvided(receiptDateTime),
        notInFuture(receiptDateTime)
      ),
      params: version.validators.request('receipt/delivery-id-params')
    },
    response: {
      status: {
        201: version.validators.response('receipt/record-receipt-response')
      }
    }
  },
  handler: async (request, h) => {
    const { deliveryId } = request.params

    try {
      const traceId = getTraceId() || randomUUID()
      getOrganisationId(request)

      const movementIds = await version.deliveries.findDeliveryMovementIds(
        request.db,
        deliveryId
      )

      if (!movementIds) {
        const message = `No delivery exists with delivery ID: ${deliveryId}`
        version.logger.error({ deliveryId }, message)

        return notFound(message)
      }

      version.logger.info(
        { deliveryId },
        `Successfully recorded receipt for delivery ${deliveryId}`
      )
      request.app.journey =
        movementIds.length > 0
          ? movementIds.map((movementId) => ({ movementId, deliveryId }))
          : [{ deliveryId }]

      return h
        .response({ data: { deliveryId }, validation: { warnings: [] } })
        .code(HTTP_STATUS.CREATED)
        .header('x-request-id', traceId)
        .message('Successfully recorded a receipt')
    } catch (error) {
      return handleBetaRouteError(error)
    }
  }
})
