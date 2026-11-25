import { randomUUID } from 'node:crypto'
import { HTTP_STATUS, backoffOptions } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { backOff } from 'exponential-backoff'
import { withTransaction } from '#/common/data/with-transaction.js'
import { createDeliveryId } from '#/common/http/waste-tracking.js'
import { getOrganisationId } from '#/common/organisation.js'
import { handleBetaRouteError } from '#/common/route-errors.js'
import { withPayloadChecks } from '#/common/validation/payload-checks.js'
import {
  emptyIsNotProvided,
  notInFuture
} from '#/common/validation/date-time-checks.js'
import { wasteReferenceDataChecks } from '../checks/waste-reference-data-checks.js'

const receiptDateTime = ['receiptDateTime']

export const recordReceiptUndocumented = (version) => ({
  method: 'POST',
  path: '/receipts',
  options: {
    description: 'Record receipt of undocumented waste',
    notes:
      'Fallback for recording receipt with no prior Delivery, e.g. waste received with no movement ' +
      'trail. Not linked to any Movement; `reasonForNoDeliveryId` must explain why. Creates an empty Delivery behind ' +
      'the scenes and returns its Delivery ID, so the Receipt stays addressable.',
    app: { journeyStep: 'undocumented-receipt-recorded' },
    validate: {
      payload: withPayloadChecks(
        version.validators.request(
          'receipt/record-receipt-undocumented-request'
        ),
        wasteReferenceDataChecks,
        emptyIsNotProvided(receiptDateTime),
        notInFuture(receiptDateTime)
      )
    },
    response: {
      status: {
        201: version.validators.response(
          'receipt/record-receipt-undocumented-response'
        )
      }
    }
  },
  handler: async (request, h) => {
    try {
      const requestId = getTraceId() || randomUUID()
      const orgId = getOrganisationId(request)
      const deliveryId = await createDeliveryId()

      // The empty Delivery and its Receipt are stored together or not at all,
      // so a retry can't leave a Delivery without its Receipt.
      await backOff(
        () =>
          withTransaction(request.mongoClient, async (session) => {
            await version.deliveries.createUndocumentedDeliveryRecord(
              request.db,
              { deliveryId, orgId, requestId, payload: request.payload },
              { session }
            )
            await version.receipts.createReceiptRecord(
              request.db,
              { deliveryId, orgId, requestId, payload: request.payload },
              { session }
            )
          }),
        backoffOptions(version.logger)
      )

      version.logger.info(
        { deliveryId },
        `Successfully recorded an undocumented receipt, created delivery ${deliveryId}`
      )
      request.app.journey = [{ deliveryId }]

      return h
        .response({ data: { deliveryId }, validation: { warnings: [] } })
        .code(HTTP_STATUS.CREATED)
        .header('x-request-id', requestId)
        .message('Successfully recorded an undocumented receipt')
    } catch (error) {
      return handleBetaRouteError(error)
    }
  }
})
