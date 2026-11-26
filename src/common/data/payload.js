import { createHash } from 'node:crypto'
import { Binary } from 'mongodb'

/**
 * A request payload as stored: the parsed body serialised again as UTF-8
 * JSON. It comes back as the same data, whatever its keys (e.g. `$` or `.` in
 * them), though not necessarily the bytes sent: whitespace isn't kept, and
 * numbers are rewritten (`1.0` as `1`).
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

// By UTF-16 code unit, the order JSON Canonicalization (RFC 8785) uses. Not
// localeCompare: its order depends on the locale and ICU version, so the same
// payload could hash differently on another machine or Node release.
const byCodeUnit = (a, b) => Number(a > b) - Number(a < b)

// The value with every object's keys sorted, recursively. Arrays keep their
// order, as it carries meaning.
const canonical = (value) => {
  if (Array.isArray(value)) {
    return value.map(canonical)
  }
  if (value === null || typeof value !== 'object') {
    return value
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort(byCodeUnit)
      .map((key) => [key, canonical(value[key])])
  )
}

/**
 * A hash of a request payload that's the same however its keys are ordered
 * or spaced: SHA-256 of its JSON with every object's keys sorted, as hex. Any
 * other difference, including in an array's order, changes it.
 *
 * @param {unknown} apiPayload - the validated request body
 * @returns {string}
 */
export const hashPayload = (apiPayload) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(apiPayload)))
    .digest('hex')

/**
 * The fields a document keeps of its request: the payload, and its
 * hash, to tell a resubmission of the same request from a different one.
 *
 * @param {unknown} apiPayload - the validated request body
 * @returns {{ payload: Binary, payloadHash: string }}
 */
export const storedPayload = (apiPayload) => ({
  payload: toPayload(apiPayload),
  payloadHash: hashPayload(apiPayload)
})
