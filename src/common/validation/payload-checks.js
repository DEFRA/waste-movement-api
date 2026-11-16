import Boom from '@hapi/boom'

// Some rules can't be said in a JSON Schema: they need reference data too
// long to inline, span several fields, or depend on when the request
// arrives. Each is a check, `(payload, details) => details`: it's given the
// errors found so far, in the error-mapping detail shape, and returns the
// errors to report, so it can add its own or replace one the schema raised.
//
// withPayloadChecks wraps a route's payload validator so the checks run in
// order after the schema, whether or not it passed, and everything is
// reported together in one 400 rather than only once the rest is valid.
export const withPayloadChecks =
  (validatePayload, ...checks) =>
  (payload) => {
    let schemaDetails = []
    try {
      validatePayload(payload)
    } catch (error) {
      if (!Array.isArray(error.details)) {
        throw error
      }
      schemaDetails = error.details
    }

    const details = checks.reduce(
      (found, check) => check(payload, found),
      schemaDetails
    )
    if (details.length === 0) {
      return payload
    }
    const boomError = Boom.badRequest(details.map((d) => d.message).join('. '))
    boomError.details = details
    throw boomError
  }
