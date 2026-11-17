import { isDeepStrictEqual } from 'node:util'

// MongoDB's codes for: an action the user's roles don't allow; creating a
// collection that exists, e.g. another instance got there first; dropping an
// index that's already gone, likewise.
const UNAUTHORIZED = 13
const NAMESPACE_EXISTS = 48
const INDEX_NOT_FOUND = 27

const sameIndex = (declared, existing) =>
  isDeepStrictEqual(declared.key, existing.key) &&
  Boolean(declared.unique) === Boolean(existing.unique)

/**
 * Creates the declared indexes that are missing and drops the ones no longer
 * declared, by name. One declared with a different key or uniqueness is
 * dropped and recreated. `_id`'s own index is left alone.
 */
const syncIndexes = async (collection, declared, logger) => {
  const existing = (await collection.indexes()).filter(
    ({ name }) => name !== '_id_'
  )

  for (const index of existing) {
    const wanted = declared.find(({ name }) => name === index.name)
    if (!wanted || !sameIndex(wanted, index)) {
      try {
        await collection.dropIndex(index.name)
        logger.info(
          { collection: collection.collectionName, index: index.name },
          `Dropped index ${index.name} from ${collection.collectionName}`
        )
      } catch (error) {
        if (error.code !== INDEX_NOT_FOUND) {
          throw error
        }
      }
    }
  }

  for (const { name, key, unique } of declared) {
    if (
      !existing.some(
        (index) => index.name === name && sameIndex({ key, unique }, index)
      )
    ) {
      await collection.createIndex(key, { name, unique: Boolean(unique) })
    }
  }
}

/**
 * Makes a collection match its DB schema at boot: created with the schema as
 * its `$jsonSchema` validator if it's missing, its validator updated if the
 * schema has changed, and its indexes synced.
 *
 * Refuses to start (throws) when documents already stored don't match the
 * schema, i.e. a breaking change made without bumping DATA_GENERATION, and
 * when the validator needs updating but the database user can't (`collMod`
 * needs the dbAdmin role), as writes would then be checked against the old
 * schema.
 *
 * @param {import('mongodb').Db} db
 * @param {string} collectionName - e.g. `beta-3-g1-movements`
 * @param {import('./data-schemas.js').DataSchema} dataSchema
 * @param {object} logger
 */
export const syncCollection = async (
  db,
  collectionName,
  { schema, indexes },
  logger
) => {
  const validator = { $jsonSchema: schema }
  const [existing] = await db
    .listCollections({ name: collectionName })
    .toArray()

  if (existing) {
    const mismatched = await db
      .collection(collectionName)
      .findOne({ $nor: [validator] }, { projection: { _id: 1 } })
    if (mismatched) {
      throw new Error(
        `${collectionName} holds documents that don't match its schema, e.g. ${mismatched._id}: bump DATA_GENERATION`
      )
    }

    if (!isDeepStrictEqual(existing.options?.validator, validator)) {
      try {
        await db.command({
          collMod: collectionName,
          validator,
          validationLevel: 'strict',
          validationAction: 'error'
        })
        logger.info(
          { collection: collectionName },
          `Updated the validator of ${collectionName}`
        )
      } catch (error) {
        if (error.code === UNAUTHORIZED) {
          throw new Error(
            `Can't update the validator of ${collectionName}, as that needs the dbAdmin role: bump DATA_GENERATION`,
            { cause: error }
          )
        }
        throw error
      }
    }
  } else {
    try {
      await db.createCollection(collectionName, {
        validator,
        validationLevel: 'strict',
        validationAction: 'error'
      })
    } catch (error) {
      if (error.code !== NAMESPACE_EXISTS) {
        throw error
      }
    }
  }

  await syncIndexes(db.collection(collectionName), indexes, logger)
}
