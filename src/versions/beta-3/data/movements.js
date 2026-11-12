import { createLogger } from '#/common/helpers/logging/logger.js'

const logger = createLogger()

/**
 * The movement data access for one collection, e.g. `beta-3-r1-movements`.
 *
 * @param {string} collectionName
 */
export const movementData = (collectionName) => ({
  /**
   * A Movement is stored once: a unique index on `movementId`.
   *
   * @param {import('mongodb').Db} db
   */
  createIndexes: async (db) => {
    await db
      .collection(collectionName)
      .createIndex({ movementId: 1 }, { unique: true })
  },

  /**
   * Looks up a movement record by its movement ID.
   *
   * @param {import('mongodb').Db} db
   * @param {string} movementId
   * @returns {Promise<{ movementId: string, orgId: string, wasteItems: object[], createdAt: string } | null>}
   */
  getMovementRecord: async (db, movementId) => {
    const movementsCollection = db.collection(collectionName)
    return movementsCollection.findOne({ movementId })
  },

  /**
   * Looks up the given movement IDs and returns the subset that exist, with
   * only their waste items' classifications, which is all a delivery needs.
   *
   * @param {import('mongodb').Db} db
   * @param {string[]} movementIds
   * @returns {Promise<{ movementId: string, wasteItems?: { classification: object }[] }[]>}
   */
  findMovements: async (db, movementIds) => {
    const movementsCollection = db.collection(collectionName)
    return movementsCollection
      .find(
        { movementId: { $in: movementIds } },
        {
          projection: {
            _id: 0,
            movementId: 1,
            'wasteItems.classification': 1
          }
        }
      )
      .toArray()
  },

  /**
   * Persists a new movement record. A `movementId` already stored is a
   * duplicate key error.
   *
   * @param {import('mongodb').Db} db
   * @param {{ movementId: string, orgId: string, wasteItems: object[] }} movement
   * @returns {Promise<{ movementId: string }>}
   */
  createMovementRecord: async (db, movement) => {
    try {
      const extendedMovement = {
        ...movement,
        createdAt: new Date().toISOString()
      }

      await db
        .collection(collectionName)
        .insertOne(structuredClone(extendedMovement))

      return { movementId: extendedMovement.movementId }
    } catch (error) {
      logger.error({ error }, 'Failed to create movement')
      throw error
    }
  }
})
