import { createLogger } from '#/common/helpers/logging/logger.js'
import { toDocument } from './mappers/receipt.js'

const logger = createLogger()

/**
 * The receipt data access for one collection, e.g. `beta-3-g1-receipts`.
 *
 * @param {ReturnType<typeof import('#/common/data/entity-store.js').entityStore>} store
 */
export const receiptData = (store) => ({
  /**
   * At boot: the collection's validator and indexes (see syncCollection).
   *
   * @param {import('mongodb').Db} db
   */
  sync: (db) => store.sync(db),

  /**
   * Persists a Delivery's Receipt.
   *
   * @param {import('mongodb').Db} db
   * @param {{ deliveryId: string, orgId: string, traceId: string, payload: object }} receipt -
   * `payload` is the request body
   * @param {import('mongodb').InsertOneOptions} [options] - e.g. a session
   * @returns {Promise<object>} the stored document
   */
  createReceiptRecord: async (
    db,
    { deliveryId, orgId, traceId, payload },
    options
  ) => {
    try {
      const document = store.newDocument(
        { orgId, traceId },
        toDocument(payload, deliveryId)
      )
      await store.insertOne(db, document, options)

      return document
    } catch (error) {
      logger.error({ error }, 'Failed to create receipt')
      throw error
    }
  }
})
