import { toPayload } from '#/common/data/payload.js'
import { isHazardous } from '../../checks/waste-reference-data-checks.js'

/**
 * @param {object} apiPayload - a `POST /movements` request body
 * @returns {{ payload: import('mongodb').Binary, isHazardous: boolean }} a
 * Movement's own fields, for the store to wrap in its envelope
 */
export const toDocument = (apiPayload) => ({
  payload: toPayload(apiPayload),
  isHazardous: isHazardous(apiPayload)
})

/**
 * @param {{ _id: string }} document - a stored Movement
 * @returns {object} its `POST /movements` 201 response body
 */
export const toResponse = (document) => ({
  data: { movementId: document._id },
  validation: { warnings: [] }
})
