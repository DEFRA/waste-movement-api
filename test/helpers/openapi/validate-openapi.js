// Validates an OpenAPI 3.1 document's structure against openapi-3.1.json, the
// official OpenAPI 3.1 schema, copied verbatim from its `$id` URL. Like any
// OpenAPI-document validator, it leaves Schema Objects alone: each version's
// validators already compile its *.schema.json files in strict mode.
//
// The schema only sees the document it's given, so resolve its $refs first
// (bundle, in src/common/openapi/).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

// ajv mis-resolves `$dynamicRef`, validating e.g. a header's `schema` as a
// whole Header Object. The OpenAPI schema's only dynamic anchor is `meta`, on
// `$defs/schema`, and nothing here extends the dialect, so a plain `$ref` to
// it is equivalent — the same substitution openapi-schema-validator ships.
const openApiSchema = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'openapi-3.1.json'), 'utf-8'),
  (_key, value) =>
    value?.$dynamicRef === '#meta' ? { $ref: '#/$defs/schema' } : value
)

// Not strict: the OpenAPI schema uses keywords ajv's strict mode flags.
// `media-range` is an OpenAPI-defined format with no standard implementation.
const ajv = new Ajv2020({ strict: false, allErrors: true })
addFormats(ajv)
ajv.addFormat('media-range', true)
const validateFn = ajv.compile(openApiSchema)

/**
 * @param {object} document - an OpenAPI document with its $refs resolved
 * @returns {import('ajv').ErrorObject[] | null} why it's invalid, or null
 */
export const validateOpenApi = (document) =>
  validateFn(document) ? null : validateFn.errors
