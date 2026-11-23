// Makes an API version's collections match its DB schemas: creates the
// missing ones, and refuses to start when an existing one differs. It reads
// only collection metadata, never documents, so it takes the same time however
// much is stored. Knows nothing of Hapi, so it can run from its own process.
import { isDeepStrictEqual } from 'node:util'

// MongoDB's code for creating a collection that exists, e.g. another instance
// got there first
const NAMESPACE_EXISTS = 48

// Every write is checked, and one that doesn't match fails
const VALIDATION = { validationLevel: 'strict', validationAction: 'error' }

/**
 * The collection doesn't match its DB schema: start on new collections by
 * bumping the version's DATA_GENERATION.
 */
export class DataSchemaMismatchError extends Error {
  constructor(collectionName, reason) {
    super(`${collectionName}: ${reason}, bump DATA_GENERATION`)
    this.name = 'DataSchemaMismatchError'
  }
}

const findCollection = async (db, collectionName) => {
  const [collection] = await db
    .listCollections({ name: collectionName })
    .toArray()
  return collection
}

// Whether it created it: false when another instance got there first
const createCollection = async (db, collectionName, schema) => {
  try {
    await db.createCollection(collectionName, {
      validator: { $jsonSchema: schema },
      ...VALIDATION
    })
    return true
  } catch (error) {
    if (error.code !== NAMESPACE_EXISTS) {
      throw error
    }
    return false
  }
}

// A schema without its titles and descriptions, which document it but don't
// change what it accepts. Walks only schema nodes, so a field named
// `description` is kept.
const shapeOf = (node) => {
  const { title, description, properties, items, ...rest } = node
  return {
    ...rest,
    ...(properties && {
      properties: Object.fromEntries(
        Object.entries(properties).map(([name, child]) => [
          name,
          shapeOf(child)
        ])
      )
    }),
    ...(items && { items: shapeOf(items) })
  }
}

/**
 * A validator is never updated in place: the one a collection holds is the
 * schema every document in it was written under, so any change to the shape
 * it accepts is a new generation. Only titles and descriptions may differ.
 */
const checkValidator = ({ name, options }, schema) => {
  const stored = options.validator?.$jsonSchema
  if (!stored) {
    throw new DataSchemaMismatchError(
      name,
      'has no validator to compare its schema with'
    )
  }

  if (
    !isDeepStrictEqual(shapeOf(stored), shapeOf(schema)) ||
    options.validationLevel !== VALIDATION.validationLevel ||
    options.validationAction !== VALIDATION.validationAction
  ) {
    throw new DataSchemaMismatchError(
      name,
      'its validator differs from its schema'
    )
  }
}

// Compared as entries, as a compound index's key order matters
const sameIndex = (declared, existing) =>
  isDeepStrictEqual(
    Object.entries(declared.key),
    Object.entries(existing.key)
  ) && Boolean(declared.unique) === Boolean(existing.unique)

/**
 * Indexes are fixed for a generation: building one on a large collection
 * would hold up boot. The only ones created are those missing from an empty
 * collection, e.g. when another instance created it but hasn't finished its
 * indexes, or crashed before it did.
 */
const syncIndexes = async (collection, declared) => {
  const existing = (await collection.indexes()).filter(
    ({ name }) => name !== '_id_'
  )
  const unexpected = existing.filter(
    (index) =>
      !declared.some(
        (wanted) => wanted.name === index.name && sameIndex(wanted, index)
      )
  )
  const missing = declared.filter(
    ({ name }) => !existing.some((index) => index.name === name)
  )

  if (unexpected.length > 0) {
    throw new DataSchemaMismatchError(
      collection.collectionName,
      `its indexes differ from those declared: ${unexpected.map(({ name }) => name).join(', ')}`
    )
  }
  if (missing.length === 0) {
    return
  }
  if ((await collection.estimatedDocumentCount()) > 0) {
    throw new DataSchemaMismatchError(
      collection.collectionName,
      `it's missing declared indexes: ${missing.map(({ name }) => name).join(', ')}`
    )
  }

  await Promise.all(
    missing.map(({ name, key, unique }) =>
      collection.createIndex(key, { name, unique: Boolean(unique) })
    )
  )
}

// Creates the collection, or checks the one that exists
const ensureCollection = async (db, collectionName, schema, logger) => {
  const existing = await findCollection(db, collectionName)
  if (existing) {
    checkValidator(existing, schema)
    return
  }

  if (await createCollection(db, collectionName, schema)) {
    logger.info(
      { collection: collectionName },
      `Created ${collectionName} with its schema as its validator`
    )
    return
  }

  // Another instance created it first, maybe from a different schema
  checkValidator(await findCollection(db, collectionName), schema)
}

const syncCollection = async (
  db,
  { collectionName, dataSchema: { schema, indexes } },
  logger
) => {
  await ensureCollection(db, collectionName, schema, logger)
  await syncIndexes(db.collection(collectionName), indexes)
}

/**
 * At boot, for each collection: created with its schema as a `$jsonSchema`
 * validator and with its indexes when it's missing, and otherwise checked
 * against them. Needs only the readWrite role.
 *
 * Throws a DataSchemaMismatchError, so the service doesn't start, when a
 * collection has no validator, its validator accepts a different shape from
 * its schema (even a rollback, when the schema changed without a bump; titles
 * and descriptions may differ), or its indexes differ from those declared.
 *
 * The collections are synced at once, as they're independent. Safe to run
 * from several instances at once.
 *
 * @param {import('mongodb').Db} db
 * @param {{ collectionName: string, dataSchema: import('./data-schemas.js').DataSchema }[]} collections -
 * e.g. `{ collectionName: 'beta-3-g1-movements', dataSchema: dataSchemas.movement }`
 * @param {object} logger
 */
export const syncDataSchemas = async (db, collections, logger) => {
  await Promise.all(
    collections.map((collection) => syncCollection(db, collection, logger))
  )
}
