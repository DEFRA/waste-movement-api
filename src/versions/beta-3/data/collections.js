import { storedPayload } from '#/common/data/payload.js'
import { createLogger } from '#/common/helpers/logging/logger.js'

const logger = createLogger()

/**
 * The collection data access for one MongoDB collection, e.g.
 * `beta-3-g2-collections`. Its schema and indexes are in schemas/collection/.
 *
 * @param {ReturnType<typeof import('#/common/data/entity-store.js').entityStore>} store
 */
export const collectionData = (store) => ({
  // For syncDataSchemas, at boot
  collectionName: store.collectionName,
  dataSchema: store.dataSchema,

  /**
   * Looks up a Movement's Collection.
   *
   * @param {import('mongodb').Db} db
   * @param {string} movementId
   * @returns {Promise<object | null>} the stored document
   */
  findCollectionRecord: async (db, movementId) =>
    db.collection(store.collectionName).findOne({ movementId }),

  /**
   * Persists a Movement's Collection. A Movement has one: a `movementId`
   * already stored is a duplicate key error.
   *
   * @param {import('mongodb').Db} db
   * @param {{ movementId: string, orgId: string, requestId: string, payload: object }} collection -
   * `payload` is the request body
   * @returns {Promise<object>} the stored document
   */
  createCollectionRecord: async (
    db,
    { movementId, orgId, requestId, payload }
  ) => {
    try {
      const document = store.newDocument(
        { orgId, requestId },
        { ...storedPayload(payload), movementId }
      )
      await store.insertOne(db, document)

      return document
    } catch (error) {
      logger.error({ error }, 'Failed to create collection')
      throw error
    }
  }
})
