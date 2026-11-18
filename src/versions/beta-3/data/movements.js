import { createLogger } from '#/common/helpers/logging/logger.js'
import { toDocument } from './mappers/movement.js'

const logger = createLogger()

/**
 * The movement data access for one collection, e.g. `beta-3-g1-movements`.
 * A Movement is stored once: its Movement ID is the document's `_id`.
 *
 * @param {ReturnType<typeof import('#/common/data/entity-store.js').entityStore>} store
 */
export const movementData = (store) => ({
  /**
   * At boot: the collection's validator and indexes (see syncCollection).
   *
   * @param {import('mongodb').Db} db
   */
  sync: (db) => store.sync(db),

  /**
   * Looks up a movement record by its movement ID.
   *
   * @param {import('mongodb').Db} db
   * @param {string} movementId
   * @returns {Promise<object | null>} the stored document
   */
  getMovementRecord: async (db, movementId) =>
    db.collection(store.collectionName).findOne({ _id: movementId }),

  /**
   * Looks up the given movement IDs and returns the subset that exist, with
   * only whether each is hazardous, which is all a delivery needs.
   *
   * @param {import('mongodb').Db} db
   * @param {string[]} movementIds
   * @returns {Promise<{ movementId: string, isHazardous: boolean }[]>}
   */
  findMovements: async (db, movementIds) => {
    const found = await db
      .collection(store.collectionName)
      .find({ _id: { $in: movementIds } }, { projection: { isHazardous: 1 } })
      .toArray()

    return found.map(({ _id, isHazardous }) => ({
      movementId: _id,
      isHazardous
    }))
  },

  /**
   * Persists a new movement record. A `movementId` already stored is a
   * duplicate key error.
   *
   * @param {import('mongodb').Db} db
   * @param {{ movementId: string, orgId: string, traceId: string, payload: object }} movement -
   * `payload` is the `POST /movements` request body
   * @returns {Promise<{ movementId: string }>}
   */
  createMovementRecord: async (db, { movementId, orgId, traceId, payload }) => {
    try {
      const document = store.newDocument(
        { _id: movementId, orgId, traceId },
        toDocument(payload)
      )
      await store.insertOne(db, document)

      return { movementId }
    } catch (error) {
      logger.error({ error }, 'Failed to create movement')
      throw error
    }
  }
})
