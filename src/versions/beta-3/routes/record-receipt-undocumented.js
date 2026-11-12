import { randomUUID } from 'node:crypto'
import { HTTP_STATUS, backoffOptions } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { backOff } from 'exponential-backoff'
import { createDeliveryId } from '#/common/http/waste-tracking.js'
import { getOrganisationId } from '#/common/organisation.js'
import { handleBetaRouteError } from '#/common/route-errors.js'
import { withPayloadChecks } from '#/common/validation/payload-checks.js'
import { emptyIsNotProvided, notInFuture } from '../checks/date-time-checks.js'
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
      const traceId = getTraceId() || randomUUID()
      const orgId = getOrganisationId(request)
      const deliveryId = await createDeliveryId()

      await backOff(
        () =>
          version.deliveries.createDeliveryRecord(request.db, {
            deliveryId,
            movementIds: [],
            orgId
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
        .header('x-request-id', traceId)
        .message('Successfully recorded an undocumented receipt')
    } catch (error) {
      return handleBetaRouteError(error)
    }
  }
})
