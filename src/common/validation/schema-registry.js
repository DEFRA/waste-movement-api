// Compiles every JSON Schema file under a schema root with ajv, and exposes a
// single validate(id, payload) entry point keyed by each file's path relative
// to that root (e.g. "common/producer/producer.schema.json").
//
// The schema files themselves carry no $id. The key passed to addSchema
// becomes the schema's base URI, so relative $refs resolve against the
// file's own location — siblings (producer-base.schema.json) and
// cross-folder (../common/producer/producer.schema.json) alike. Leaving
// $id out also means the files stay correct when served over HTTP
// elsewhere, where the base URI falls back to the retrieval URL.
//
// Each root gets its own ajv instance, so two API versions can hold schemas
// at the same relative paths without colliding.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

export function collectFiles(dir, suffix) {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      return collectFiles(fullPath, suffix)
    }
    return entry.endsWith(suffix) ? [fullPath] : []
  })
}

/**
 * @param {string} schemaRoot - absolute path of the folder holding the schemas
 */
export function createSchemaRegistry(schemaRoot) {
  // allowUnionTypes: strict mode's strictTypes otherwise rejects a
  // `type: [object, 'null']` union, which the response schemas port verbatim
  // from the OpenAPI spec (recordCollectionResponse's always-null `data`).
  // verbose: each error carries the `parentSchema` that raised it, whose
  // description error-mapping uses as the message for a conditional rule.
  // It also carries `data`, the offending payload value — keep that out of logs.
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    allowUnionTypes: true,
    verbose: true
  })
  addFormats(ajv, ['date-time', 'email', 'uuid'])

  for (const file of collectFiles(schemaRoot, '.schema.json')) {
    const schema = JSON.parse(readFileSync(file, 'utf-8'))

    // Keys are URI-style paths ("/"-separated), independent of the OS path separator.
    const key = path.relative(schemaRoot, file).split(path.sep).join('/')

    ajv.addSchema(schema, key)
  }

  return {
    ajv,

    /**
     * Validates `payload` against the schema registered under `id` — its
     * path relative to the schema root. Returns true/false, same as calling
     * an ajv-compiled validate function directly — use getErrors(id) after a
     * `false` result to see why.
     */
    validate(id, payload) {
      const validateFn = ajv.getSchema(id)
      if (!validateFn) {
        throw new Error(`No schema registered under "${id}".`)
      }
      return validateFn(payload)
    },

    /**
     * The ajv validation errors from the most recent validate(id, ...) call
     * against that schema, or null if it last passed / hasn't run yet.
     */
    getErrors(id) {
      return ajv.getSchema(id)?.errors ?? null
    }
  }
}
