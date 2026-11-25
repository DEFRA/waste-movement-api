import { randomUUID } from 'node:crypto'
import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { notFound } from '@hapi/boom'
import { insertOnce } from '#/common/data/insert-once.js'
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
    notes:
      'Records receipt of the waste delivered under the given Delivery. A Delivery is received once: the same request again succeeds without storing anything, and a different second receipt is a 409.',
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
      const requestId = getTraceId() || randomUUID()
      const orgId = getOrganisationId(request)

      const movementIds = await version.deliveries.findDeliveryMovementIds(
        request.db,
        deliveryId
      )

      if (!movementIds) {
        const message = `No delivery exists with delivery ID: ${deliveryId}`
        version.logger.error({ deliveryId }, message)

        return notFound(message)
      }

      // A Delivery's Receipt is recorded once: the same request again
      // succeeds without storing anything, a different one is a 409
      await insertOnce(version.logger, {
        insert: () =>
          version.receipts.createReceiptRecord(request.db, {
            deliveryId,
            orgId,
            requestId,
            payload: request.payload
          }),
        findStored: () =>
          version.receipts.findReceiptRecord(request.db, deliveryId),
        request: { orgId, payload: request.payload },
        conflictMessage: `A receipt has already been recorded for delivery ID: ${deliveryId}`,
        context: { deliveryId }
      })

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
        .header('x-request-id', requestId)
        .message('Successfully recorded a receipt')
    } catch (error) {
      return handleBetaRouteError(error)
    }
  }
})
