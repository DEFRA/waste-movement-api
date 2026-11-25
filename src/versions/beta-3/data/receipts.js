import { storedPayload } from '#/common/data/payload.js'
import { createLogger } from '#/common/helpers/logging/logger.js'

const logger = createLogger()

/**
 * The receipt data access for one collection, e.g. `beta-3-g2-receipts`. Its
 * schema and indexes are in schemas/receipt/.
 *
 * @param {ReturnType<typeof import('#/common/data/entity-store.js').entityStore>} store
 */
export const receiptData = (store) => ({
  // For syncDataSchemas, at boot
  collectionName: store.collectionName,
  dataSchema: store.dataSchema,

  /**
   * Looks up a Delivery's Receipt.
   *
   * @param {import('mongodb').Db} db
   * @param {string} deliveryId
   * @returns {Promise<object | null>} the stored document
   */
  findReceiptRecord: async (db, deliveryId) =>
    db.collection(store.collectionName).findOne({ deliveryId }),

  /**
   * Persists a Delivery's Receipt. A Delivery has one: a `deliveryId` already
   * stored is a duplicate key error.
   *
   * @param {import('mongodb').Db} db
   * @param {{ deliveryId: string, orgId: string, requestId: string, payload: object }} receipt -
   * `payload` is the request body
   * @param {import('mongodb').InsertOneOptions} [options] - e.g. a session
   * @returns {Promise<object>} the stored document
   */
  createReceiptRecord: async (
    db,
    { deliveryId, orgId, requestId, payload },
    options
  ) => {
    try {
      const document = store.newDocument(
        { orgId, requestId },
        { ...storedPayload(payload), deliveryId }
      )
      await store.insertOne(db, document, options)

      return document
    } catch (error) {
      logger.error({ error }, 'Failed to create receipt')
      throw error
    }
  }
})
