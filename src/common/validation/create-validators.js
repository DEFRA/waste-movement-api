import Boom from '@hapi/boom'
import { createLogger } from '#/common/helpers/logging/logger.js'
import { createSchemaRegistry } from './schema-registry.js'
import { toValidationDetails } from './error-mapping.js'

const logger = createLogger()

/**
 * Hapi validators for the JSON Schemas under `schemaRoot`, each named by its
 * path relative to that root without `.schema.json`, e.g.
 * `request('creation/create-movement-request')`.
 *
 * @param {string} schemaRoot - absolute path of the folder holding the schemas
 */
export function createValidators(schemaRoot) {
  const registry = createSchemaRegistry(schemaRoot)
  const { validate, getErrors } = registry

  /**
   * For `options.validate.payload` / `params`. Throws a Boom 400 carrying
   * the mapped `details`, which the RFC 9457 formatter reports as `errors`.
   */
  const request = (name) => {
    const schemaId = `${name}.schema.json`
    return (value) => {
      if (validate(schemaId, value)) {
        return value
      }
      const details = toValidationDetails(getErrors(schemaId))
      const boomError = Boom.badRequest(
        details.map((d) => d.message).join('. ')
      )
      boomError.details = details
      throw boomError
    }
  }

  /**
   * For `options.response.status[...]`. A mismatch is our bug, not the
   * caller's: Hapi turns the throw into a generic 500, so the ajv errors are
   * logged here (Hapi's own request log doesn't reliably reach pino) and
   * never sent to the client.
   */
  const response = (name) => {
    const schemaId = `${name}.schema.json`
    return (value) => {
      if (validate(schemaId, value)) {
        return value
      }
      // Only what locates the mismatch: verbose errors also carry the
      // schemas and `data`, which would log the response body.
      const errors = getErrors(schemaId).map(
        ({ instancePath, schemaPath, keyword, params, message }) => ({
          instancePath,
          schemaPath,
          keyword,
          params,
          message
        })
      )
      logger.error({ schemaId, errors }, 'Response failed schema validation')
      throw new Error(`Response does not match ${schemaId}`)
    }
  }

  return { ...registry, request, response }
}
