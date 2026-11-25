// Loads one API version's DB schemas: the stored shape of each entity, as
// a JSON Schema in MongoDB's `$jsonSchema` dialect (JSON types as `type`,
// BSON-only ones such as `objectId` or `date` as `bsonType`), with
// its indexes beside it. Each entity is a folder under the schema root:
//
//   movement/movement.schema.json    the stored shape
//   movement/movement.indexes.json   its indexes
//   movement/movement.examples.json  stored documents, as relaxed Extended
//                                    JSON (`$date`, `$binary`, `$oid`)
//
// A schema's `$ref`s are resolved when it's loaded, as MongoDB can't follow
// them, so the same self-contained schema is checked by ajv before a write
// and by MongoDB as the collection's validator.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import Ajv from 'ajv'
import { BSON } from 'mongodb'
import { bundle } from '#/common/openapi/bundle.js'

const isBsonValue = (type) => (value) => value?._bsontype === type

const isPlainObject = (value) =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  value._bsontype === undefined

// What each bsonType a schema here uses looks like as a JavaScript value, as
// the driver writes and reads it
const bsonTypes = {
  array: Array.isArray,
  binData: isBsonValue('Binary'),
  bool: (value) => typeof value === 'boolean',
  date: (value) => value instanceof Date,
  // An int32 survives being stored in an Int32Array unchanged
  int: (value) =>
    typeof value === 'number' && Int32Array.of(value)[0] === value,
  null: (value) => value === null,
  object: isPlainObject,
  objectId: isBsonValue('ObjectId'),
  string: (value) => typeof value === 'string'
}

export const BSON_TYPES = Object.keys(bsonTypes)

const createAjv = () => {
  // strictTypes off: some of a schema's types are in `bsonType`, which ajv
  // can't see, so it would otherwise reject a node without a `type`.
  const ajv = new Ajv({ allErrors: true, strict: true, strictTypes: false })
  ajv.addKeyword({
    keyword: 'bsonType',
    metaSchema: {
      anyOf: [
        { enum: BSON_TYPES },
        { type: 'array', items: { enum: BSON_TYPES }, minItems: 1 }
      ]
    },
    validate: (types, value) =>
      [types].flat().some((type) => bsonTypes[type](value)),
    errors: false
  })
  return ajv
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf-8'))

/**
 * @param {string} schemaRoot - absolute path of the folder of entity folders
 * @returns {string[]} the entities, e.g. ['delivery', 'movement']: every
 * folder with a `<name>.schema.json` and `<name>.indexes.json`
 */
export const entityNames = (schemaRoot) =>
  readdirSync(schemaRoot)
    .filter(
      (name) =>
        statSync(path.join(schemaRoot, name)).isDirectory() &&
        existsSync(path.join(schemaRoot, name, `${name}.schema.json`)) &&
        existsSync(path.join(schemaRoot, name, `${name}.indexes.json`))
    )
    .sort((a, b) => a.localeCompare(b))

/**
 * @param {string} schemaRoot
 * @param {string} name - an entity, e.g. 'movement'
 * @returns {object} the entity's schema with every `$ref` resolved
 */
export const loadDataSchema = (schemaRoot, name) =>
  bundle(path.join(schemaRoot, name, `${name}.schema.json`))

/**
 * @param {string} schemaRoot
 * @param {string} name
 * @returns {Record<string, object>} the entity's named example documents
 */
export const loadDataExamples = (schemaRoot, name) =>
  BSON.EJSON.parse(
    readFileSync(path.join(schemaRoot, name, `${name}.examples.json`), 'utf-8')
  )

/**
 * @typedef {object} DataSchema
 * @property {string} name - the entity, e.g. 'movement'
 * @property {object} schema - self-contained, for ajv and MongoDB alike
 * @property {{ name: string, key: object, unique?: boolean }[]} indexes
 * @property {(document: object) => boolean} validate - ajv's compiled
 * validator, with its `errors` after a `false`
 */

/**
 * @param {string} schemaRoot - absolute path of the folder of entity folders
 * @returns {Record<string, DataSchema>} keyed by entity name
 */
export const loadDataSchemas = (schemaRoot) => {
  const ajv = createAjv()

  return Object.fromEntries(
    entityNames(schemaRoot).map((name) => {
      const schema = loadDataSchema(schemaRoot, name)
      return [
        name,
        {
          name,
          schema,
          indexes: readJson(
            path.join(schemaRoot, name, `${name}.indexes.json`)
          ),
          validate: ajv.compile(schema)
        }
      ]
    })
  )
}
