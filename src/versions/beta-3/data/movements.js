import { storedPayload } from '#/common/data/payload.js'
import { createLogger } from '#/common/helpers/logging/logger.js'
import { isHazardous } from '../checks/waste-reference-data-checks.js'

const logger = createLogger()

/**
 * The movement data access for one collection, e.g. `beta-3-g2-movements`.
 * Its schema and indexes are in schemas/movement/: syncDataSchemas creates
 * the collection with them, and a unique index on `movementId` stores a
 * Movement once.
 *
 * @param {ReturnType<typeof import('#/common/data/entity-store.js').entityStore>} store
 */
export const movementData = (store) => ({
  // For syncDataSchemas, at boot
  collectionName: store.collectionName,
  dataSchema: store.dataSchema,

  /**
   * Looks up a movement record by its movement ID.
   *
   * @param {import('mongodb').Db} db
   * @param {string} movementId
   * @returns {Promise<object | null>} the stored document
   */
  getMovementRecord: async (db, movementId) =>
    db.collection(store.collectionName).findOne({ movementId }),

  /**
   * Looks up the given movement IDs and returns the subset that exist, with
   * only whether each is hazardous, which is all a delivery needs.
   *
   * @param {import('mongodb').Db} db
   * @param {string[]} movementIds
   * @returns {Promise<{ movementId: string, isHazardous: boolean }[]>}
   */
  findMovements: async (db, movementIds) =>
    db
      .collection(store.collectionName)
      .find(
        { movementId: { $in: movementIds } },
        { projection: { _id: 0, movementId: 1, isHazardous: 1 } }
      )
      .toArray(),

  /**
   * Persists a new movement record. A `movementId` already stored is a
   * duplicate key error.
   *
   * @param {import('mongodb').Db} db
   * @param {{ movementId: string, payload: object } & import('#/common/data/entity-store.js').Envelope} movement -
   * `payload` is the `POST /movements` request body
   * @returns {Promise<{ movementId: string }>}
   */
  createMovementRecord: async (db, { movementId, payload, ...envelope }) => {
    try {
      await store.insertOne(
        db,
        // The request, plus only what POST /deliveries reads
        store.newDocument(envelope, {
          ...storedPayload(payload),
          movementId,
          isHazardous: isHazardous(payload)
        })
      )

      return { movementId }
    } catch (error) {
      logger.error({ error }, 'Failed to create movement')
      throw error
    }
  }
})
