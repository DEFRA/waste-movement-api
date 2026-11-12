import { ERROR_TYPE } from '@defra/waste-movement-utils'

// Payload checks (see payload-checks.js) for date-time fields. The JSON
// Schema checks a date-time is given and is ISO 8601; rules that depend on
// when the request arrives can't be said there, so they're here. Each takes the field's path, e.g. ['receiptDateTime'], with array
// indexes as strings like the paths in the details.

const valueAt = (payload, path) =>
  path.reduce((value, key) => value?.[key], payload)

const isAt = (path) => (detail) =>
  detail.path.length === path.length &&
  detail.path.every((key, i) => key === path[i])

// The schema reports "" as not matching the date-time format, but "" means
// the field isn't provided, so it's reported as required instead.
export const emptyIsNotProvided = (path) => (payload, details) =>
  valueAt(payload, path) === ''
    ? [
        ...details.filter((detail) => !isAt(path)(detail)),
        {
          message: `'${path.at(-1)}' is required`,
          path,
          type: ERROR_TYPE.NOT_PROVIDED
        }
      ]
    : details

// Only a value nothing else has rejected is checked: one already reported
// may not parse, and needs fixing first. `now` is for tests.
export const notInFuture =
  (path, { now = Date.now } = {}) =>
  (payload, details) => {
    const value = valueAt(payload, path)
    return details.some(isAt(path)) ||
      typeof value !== 'string' ||
      Date.parse(value) <= now()
      ? details
      : [
          ...details,
          {
            message: 'must not be in the future',
            path,
            type: ERROR_TYPE.OUT_OF_RANGE
          }
        ]
  }
