import { storedPayload } from '#/common/data/payload.js'
import { isHazardous } from '../checks/waste-reference-data-checks.js'
import { WASTE_TYPE } from '../checks/waste-type.js'
import { withTransaction } from '#/common/data/with-transaction.js'
import { createLogger } from '#/common/helpers/logging/logger.js'

const logger = createLogger()

/**
 * The delivery data access for one collection, e.g. `beta-3-g2-deliveries`.
 * Its schema and indexes are in schemas/delivery/: syncDataSchemas creates
 * the collection with them. Deliveries are looked up by `deliveryId`, which
 * isn't unique: a resubmitted hazardous Movement has a record per
 * submission, all with its Movement ID as their Delivery ID (see
 * createDeliveryRecords). The Deliveries one request recorded share its
 * `requestId`.
 *
 * @param {ReturnType<typeof import('#/common/data/entity-store.js').entityStore>} store
 */
export const deliveryData = (store) => ({
  // For syncDataSchemas, at boot
  collectionName: store.collectionName,
  dataSchema: store.dataSchema,

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
   * Persists the empty delivery an undocumented receipt creates. It keeps
   * that receipt's request, as the receipt does, and its waste type comes
   * from that request's waste items, as a movement's does.
   *
   * @param {import('mongodb').Db} db
   * @param {{ deliveryId: string, orgId: string, requestId: string, payload: object }} delivery -
   * `payload` is the `POST /receipts` request body
   * @param {import('mongodb').InsertOneOptions} [options] - e.g. a session
   * @returns {Promise<{ deliveryId: string }>}
   */
  createUndocumentedDeliveryRecord: async (
    db,
    { deliveryId, orgId, requestId, payload },
    options
  ) => {
    try {
      await store.insertOne(
        db,
        store.newDocument(
          { orgId, requestId },
          {
            ...storedPayload(payload),
            deliveryId,
            movementIds: [],
            wasteType: isHazardous(payload)
              ? WASTE_TYPE.HAZARDOUS
              : WASTE_TYPE.NON_HAZARDOUS
          }
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
   * order, each keeping the whole request body and its `requestId`. Written
   * in one transaction, so a failure leaves none of them behind and the
   * caller can safely retry.
   *
   * NOTE: nothing stops the same data being stored twice: a Movement
   * submitted in a second delivery gets a second record, and a resubmitted
   * hazardous Movement produces two records with the same `deliveryId` (its
   * Movement ID).
   *
   * @param {import('mongodb').Db} db
   * @param {import('mongodb').MongoClient} mongoClient
   * @param {{ orgId: string, requestId: string, payload: object }} request -
   * `payload` is the `POST /deliveries` request body
   * @param {{ deliveryId: string, movementIds: string[], wasteType: string }[]} groupings
   * @returns {Promise<object[]>} the stored documents, in input order
   */
  createDeliveryRecords: async (
    db,
    mongoClient,
    { orgId, requestId, payload },
    groupings
  ) => {
    try {
      // Each keeps the whole request; its grouping isn't in the request, it's
      // worked out from the Movements delivered
      const documents = groupings.map(
        ({ deliveryId, movementIds, wasteType }) =>
          store.newDocument(
            { orgId, requestId },
            {
              ...storedPayload(payload),
              deliveryId,
              movementIds,
              wasteType
            }
          )
      )

      await withTransaction(mongoClient, (session) =>
        store.insertMany(db, documents, { ordered: true, session })
      )

      return documents
    } catch (error) {
      logger.error({ error }, 'Failed to create deliveries')
      throw error
    }
  }
})
