import { Binary } from 'mongodb'

/**
 * A request payload as stored: its JSON as UTF-8 bytes, so it comes back
 * exactly as the caller sent it, never queried or edited, whatever its keys
 * (e.g. `$` or `.` in them) or numbers.
 *
 * @param {unknown} apiPayload - the validated request body
 * @returns {Binary}
 */
export const toPayload = (apiPayload) =>
  new Binary(Buffer.from(JSON.stringify(apiPayload), 'utf8'))

/**
 * @param {Binary} payload - as stored by toPayload
 * @returns {unknown} the request body it was made from
 */
export const fromPayload = (payload) => JSON.parse(payload.toString('utf8'))
