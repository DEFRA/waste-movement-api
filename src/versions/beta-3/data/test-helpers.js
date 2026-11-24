// Stores this version's data for tests as the routes would, through its data
// access objects, so it matches the DB schemas its collections are validated
// against.
import { forwardedOrganisationId } from '#test/data/organisation-headers.js'
import { wasteItem } from '../schemas/test-helpers.js'
import { version } from '../index.js'

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
        wasteItems
      })
    )
  )

/**
 * Stores a Delivery of the given Movements, or of none, as for an
 * undocumented Receipt.
 *
 * @param {import('mongodb').Db} db
 * @param {string} deliveryId
 * @param {string[]} [movementIds]
 */
export const storeDelivery = (db, deliveryId, movementIds = []) =>
  version.deliveries.createDeliveryRecord(db, {
    deliveryId,
    movementIds,
    orgId: forwardedOrganisationId
  })
