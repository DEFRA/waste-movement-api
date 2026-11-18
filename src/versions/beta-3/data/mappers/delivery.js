import { toPayload } from '#/common/data/payload.js'

/**
 * One of the Deliveries a `POST /deliveries` request records. Its grouping
 * isn't in the request: it's worked out from the Movements delivered.
 *
 * @param {object} apiPayload - the `POST /deliveries` request body
 * @param {{ deliveryId: string, movementIds: string[], wasteType: string }} grouping
 */
export const toDocument = (
  apiPayload,
  { deliveryId, movementIds, wasteType }
) => ({
  payload: toPayload(apiPayload),
  deliveryId,
  movementIds,
  wasteType
})

/**
 * The empty Delivery `POST /receipts` creates for an undocumented Receipt.
 * Its request is kept with the Receipt.
 *
 * @param {string} deliveryId
 */
export const toUndocumentedDocument = (deliveryId) => ({
  deliveryId,
  movementIds: []
})

/**
 * @param {{ deliveryId: string, movementIds: string[], wasteType: string }[]} documents -
 * the Deliveries one request recorded, in order
 * @returns {object} the `POST /deliveries` 201 response body
 */
export const toResponse = (documents) => ({
  data: {
    deliveries: documents.map(({ deliveryId, movementIds, wasteType }) => ({
      deliveryId,
      movementIds,
      wasteType
    }))
  },
  validation: { warnings: [] }
})
