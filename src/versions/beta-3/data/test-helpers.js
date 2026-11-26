// Stores this version's data for tests as the routes would, through its data
// access objects, so it matches the DB schemas its collections are validated
// against.
import {
  forwardedClient,
  forwardedOrganisationId
} from '#test/data/organisation-headers.js'
import { wasteItem } from '../schemas/test-helpers.js'
import { version } from '../index.js'

export const seededRequestId = 'seeded-request-id'

/**
 * Stores a Movement for each ID, as `POST /movements` would.
 *
 * @param {import('mongodb').Db} db
 * @param {string[]} movementIds
 * @param {{ wasteItems?: object[], orgId?: string }} [options] - one
 * non-hazardous waste item by default
 */
export const storeMovements = (
  db,
  movementIds,
  { wasteItems = [wasteItem], orgId = forwardedOrganisationId } = {}
) =>
  Promise.all(
    movementIds.map((movementId) =>
      version.movements.createMovementRecord(db, {
        movementId,
        orgId,
        ...forwardedClient,
        requestId: seededRequestId,
        payload: { wasteItems }
      })
    )
  )

/**
 * Stores a Delivery: of the given Movements, as `POST /deliveries` would, or
 * of none, as for an undocumented Receipt.
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
  const envelope = {
    orgId: forwardedOrganisationId,
    ...forwardedClient,
    requestId: seededRequestId
  }

  return movementIds.length === 0
    ? version.deliveries.createUndocumentedDeliveryRecord(db, {
        ...envelope,
        deliveryId,
        payload: { reasonForNoDeliveryId: 'No delivery was recorded' }
      })
    : version.deliveries.createDeliveryRecords(
        db,
        mongoClient,
        { ...envelope, payload: { movementIds } },
        [{ deliveryId, movementIds, wasteType: 'NON_HAZARDOUS' }]
      )
}
