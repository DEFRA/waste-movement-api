import { toPayload } from '#/common/data/payload.js'

/**
 * @param {object} apiPayload - a `POST /movements/{movementId}/collection`
 * request body
 * @param {string} movementId - the Movement collected
 */
export const toDocument = (apiPayload, movementId) => ({
  payload: toPayload(apiPayload),
  movementId
})

/**
 * @param {object} _document - a stored Collection
 * @returns {object} its 201 response body, which has no data
 */
export const toResponse = (_document) => ({
  data: null,
  validation: { warnings: [] }
})
