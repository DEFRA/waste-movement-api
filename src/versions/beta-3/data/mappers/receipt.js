import { toPayload } from '#/common/data/payload.js'

/**
 * @param {object} apiPayload - a `POST /deliveries/{deliveryId}/receipt` or
 * `POST /receipts` request body
 * @param {string} deliveryId - the Delivery received
 */
export const toDocument = (apiPayload, deliveryId) => ({
  payload: toPayload(apiPayload),
  deliveryId
})

/**
 * @param {{ deliveryId: string }} document - a stored Receipt
 * @returns {object} its 201 response body, for either route
 */
export const toResponse = (document) => ({
  data: { deliveryId: document.deliveryId },
  validation: { warnings: [] }
})
