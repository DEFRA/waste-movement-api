// Loads one API version's DB schemas: the stored shape of each entity, as a
// JSON Schema in MongoDB's `$jsonSchema` dialect (types as `bsonType`), with
// its indexes beside it. Each entity is a folder under the schema root:
//
//   movement/movement.schema.json    the stored shape
//   movement/movement.indexes.json   its indexes
//   movement/movement.examples.json  stored documents, as relaxed Extended
//                                    JSON (`$oid`, `$date`)
//
// A schema is used as is, as its collection's validator, so it has no `$ref`s:
// MongoDB can't follow them.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { BSON } from 'mongodb'

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
 * @property {object} schema - its collection's `$jsonSchema` validator
 * @property {{ name: string, key: object, unique?: boolean }[]} indexes
 */

/**
 * @param {string} schemaRoot - absolute path of the folder of entity folders
 * @returns {Record<string, DataSchema>} keyed by entity name
 */
export const loadDataSchemas = (schemaRoot) =>
  Object.fromEntries(
    entityNames(schemaRoot).map((name) => {
      const file = (suffix) => path.join(schemaRoot, name, `${name}.${suffix}`)
      return [
        name,
        {
          name,
          schema: readJson(file('schema.json')),
          indexes: readJson(file('indexes.json'))
        }
      ]
    })
  )
