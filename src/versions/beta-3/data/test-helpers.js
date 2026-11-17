// Shared fixtures for tests that need this version's data already stored.
// Documents go through the data access objects, so they match the DB schemas
// the collections are validated against.
import { forwardedOrganisationId } from '#test/data/organisation-headers.js'
import { wasteItem } from '../schemas/test-helpers.js'
import { version } from '../index.js'

export const seededTraceId = 'seeded-trace-id'

/**
 * Stores a Movement for each ID, as `POST /movements` would with the given
 * waste items.
 *
 * @param {import('mongodb').Db} db
 * @param {string[]} movementIds
 * @param {object[]} [wasteItems] - one non-hazardous item by default
 */
export const storeMovements = (db, movementIds, wasteItems = [wasteItem]) =>
  Promise.all(
    movementIds.map((movementId) =>
      version.movements.createMovementRecord(db, {
        movementId,
        orgId: forwardedOrganisationId,
        traceId: seededTraceId,
        payload: { wasteItems }
      })
    )
  )

/**
 * Stores a Delivery: of the given Movements, as `POST /deliveries` would, or
 * with none, as for an undocumented Receipt.
 *
 * @param {{ db: import('mongodb').Db, mongoClient: import('mongodb').MongoClient }} server
 * @param {string} deliveryId
 * @param {string[]} [movementIds]
 */
export const storeDelivery = (
  { db, mongoClient },
  deliveryId,
  movementIds = []
) => {
  const envelope = { orgId: forwardedOrganisationId, traceId: seededTraceId }

  return movementIds.length === 0
    ? version.deliveries.createUndocumentedDeliveryRecord(db, {
        ...envelope,
        deliveryId
      })
    : version.deliveries.createDeliveryRecords(
        db,
        mongoClient,
        { ...envelope, payload: { movementIds } },
        [{ deliveryId, movementIds, wasteType: 'NON_HAZARDOUS' }]
      )
}
