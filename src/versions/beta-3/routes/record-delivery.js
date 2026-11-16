import { randomUUID } from 'node:crypto'
import { HTTP_STATUS, backoffOptions } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { badRequest } from '@hapi/boom'
import { backOff } from 'exponential-backoff'
import { createDeliveryId } from '#/common/http/waste-tracking.js'
import { getOrganisationId } from '#/common/organisation.js'
import { handleBetaRouteError } from '#/common/route-errors.js'
import { isHazardous } from '../checks/waste-reference-data-checks.js'
import { WASTE_TYPE } from '../checks/waste-type.js'

/**
 * Groups the submitted movements into deliveries: one minted Delivery for all
 * the non-hazardous movements, then one Delivery per hazardous movement whose
 * Delivery ID is its own Movement ID. A movement is hazardous when any of its
 * waste items declares hazardous properties.
 *
 * @param {string[]} movementIds - deduplicated, in submission order
 * @param {Map<string, { wasteItems?: { classification: object }[] }>} movementsById
 * @returns {Promise<{ deliveryId: string, movementIds: string[], wasteType: string }[]>}
 */
const splitIntoDeliveries = async (movementIds, movementsById) => {
  const isHazardousMovement = (movementId) =>
    isHazardous(movementsById.get(movementId))
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
    const { logger, movements, deliveries } = version
    // A Movement ID submitted twice is only delivered once.
    const movementIds = [...new Set(request.payload.movementIds)]

    try {
      const traceId = getTraceId() || randomUUID()
      const orgId = getOrganisationId(request)

      const found = await movements.findMovements(request.db, movementIds)
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

      const split = await splitIntoDeliveries(movementIds, movementsById)

      const recordedDeliveries = await backOff(
        () =>
          deliveries.createDeliveryRecords(
            request.db,
            request.mongoClient,
            split.map((delivery) => ({ ...delivery, orgId }))
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
        .response({
          data: { deliveries: recordedDeliveries },
          validation: { warnings: [] }
        })
        .code(HTTP_STATUS.CREATED)
        .header('x-request-id', traceId)
        .message('Successfully recorded a delivery')
    } catch (error) {
      return handleBetaRouteError(error)
    }
  }
})
