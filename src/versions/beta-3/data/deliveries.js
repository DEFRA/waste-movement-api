import { createLogger } from '#/common/helpers/logging/logger.js'
import { toDocument, toUndocumentedDocument } from './mappers/delivery.js'

const logger = createLogger()

/**
 * The delivery data access for one collection, e.g. `beta-3-g1-deliveries`.
 * Deliveries are looked up by `deliveryId`, which isn't unique: a resubmitted
 * hazardous Movement has a record per submission, all with its Movement ID
 * as their Delivery ID (see createDeliveryRecords).
 *
 * @param {ReturnType<typeof import('#/common/data/entity-store.js').entityStore>} store
 */
export const deliveryData = (store) => ({
  /**
   * At boot: the collection's validator and indexes (see syncCollection).
   *
   * @param {import('mongodb').Db} db
   */
  sync: (db) => store.sync(db),

  /**
   * Finds the Movement IDs delivered under the given delivery id. Reads
   * every record with that id, as a resubmitted hazardous Movement has more
   * than one (see createDeliveryRecords).
   *
   * @param {import('mongodb').Db} db
   * @param {string} deliveryId
   * @returns {Promise<string[] | null>} deduplicated (empty for an
   * undocumented receipt's delivery); null when no delivery exists
   */
  findDeliveryMovementIds: async (db, deliveryId) => {
    const deliveries = await db
      .collection(store.collectionName)
      .find({ deliveryId }, { projection: { movementIds: 1 } })
      .toArray()

    if (deliveries.length === 0) {
      return null
    }

    return [...new Set(deliveries.flatMap(({ movementIds }) => movementIds))]
  },

  /**
   * Persists the empty delivery an undocumented receipt creates.
   *
   * @param {import('mongodb').Db} db
   * @param {{ deliveryId: string, orgId: string, traceId: string }} delivery
   * @param {import('mongodb').InsertOneOptions} [options] - e.g. a session
   * @returns {Promise<{ deliveryId: string }>}
   */
  createUndocumentedDeliveryRecord: async (
    db,
    { deliveryId, orgId, traceId },
    options
  ) => {
    try {
      await store.insertOne(
        db,
        store.newDocument(
          { orgId, traceId },
          toUndocumentedDocument(deliveryId)
        ),
        options
      )

      return { deliveryId }
    } catch (error) {
      logger.error({ error }, 'Failed to create delivery')
      throw error
    }
  },

  /**
   * Persists the deliveries one `POST /deliveries` request recorded, in
   * order, each keeping the request body. Written in one transaction, so a
   * failure leaves none of them behind and the caller can safely retry.
   *
   * NOTE: nothing stops the same data being stored twice: a Movement
   * submitted in a second delivery gets a second record, and a resubmitted
   * hazardous Movement produces two records with the same `deliveryId` (its
   * Movement ID).
   *
   * @param {import('mongodb').Db} db
   * @param {import('mongodb').MongoClient} mongoClient
   * @param {{ orgId: string, traceId: string, payload: object }} request -
   * `payload` is the `POST /deliveries` request body
   * @param {{ deliveryId: string, movementIds: string[], wasteType: string }[]} groupings
   * @returns {Promise<object[]>} the stored documents, in input order
   */
  createDeliveryRecords: async (
    db,
    mongoClient,
    { orgId, traceId, payload },
    groupings
  ) => {
    const session = mongoClient.startSession()
    try {
      const documents = groupings.map((grouping) =>
        store.newDocument({ orgId, traceId }, toDocument(payload, grouping))
      )

      await session.withTransaction(() =>
        store.insertMany(db, documents, { ordered: true, session })
      )

      return documents
    } catch (error) {
      logger.error({ error }, 'Failed to create deliveries')
      throw error
    } finally {
      await session.endSession()
    }
  }
})
