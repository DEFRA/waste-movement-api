import { createLogger } from '#/common/helpers/logging/logger.js'
import { toDocument } from './mappers/collection.js'

const logger = createLogger()

/**
 * The collection data access for one MongoDB collection, e.g.
 * `beta-3-g1-collections`.
 *
 * @param {ReturnType<typeof import('#/common/data/entity-store.js').entityStore>} store
 */
export const collectionData = (store) => ({
  /**
   * At boot: the collection's validator and indexes (see syncCollection).
   *
   * @param {import('mongodb').Db} db
   */
  sync: (db) => store.sync(db),

  /**
   * Persists a Movement's Collection.
   *
   * @param {import('mongodb').Db} db
   * @param {{ movementId: string, orgId: string, traceId: string, payload: object }} collection -
   * `payload` is the request body
   * @returns {Promise<object>} the stored document
   */
  createCollectionRecord: async (
    db,
    { movementId, orgId, traceId, payload }
  ) => {
    try {
      const document = store.newDocument(
        { orgId, traceId },
        toDocument(payload, movementId)
      )
      await store.insertOne(db, document)

      return document
    } catch (error) {
      logger.error({ error }, 'Failed to create collection')
      throw error
    }
  }
})
