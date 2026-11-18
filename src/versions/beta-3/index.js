import path from 'node:path'
import { loadDataSchemas } from '#/common/data/data-schemas.js'
import { entityStore } from '#/common/data/entity-store.js'
import {
  sweepStaleGenerations,
  versionedCollections
} from '#/common/data/versioned-collections.js'
import { createLogger } from '#/common/helpers/logging/logger.js'
import { DATA_GENERATION } from './data/generation.js'
import { collectionData } from './data/collections.js'
import { deliveryData } from './data/deliveries.js'
import { movementData } from './data/movements.js'
import { receiptData } from './data/receipts.js'
import { createMovement } from './routes/create-movement.js'
import { recordCollection } from './routes/record-collection.js'
import { recordDelivery } from './routes/record-delivery.js'
import { recordReceipt } from './routes/record-receipt.js'
import { recordReceiptUndocumented } from './routes/record-receipt-undocumented.js'
import { validators } from './schemas/validators.js'

const apiVersion = 'beta-3'
const logger = createLogger({ apiVersion })

// Names this version's collections, e.g. collectionName('movements') is
// `beta-3-g1-movements`.
export const collectionName = versionedCollections(apiVersion, DATA_GENERATION)

// The stored shape of each entity: see data/schemas/README.md
export const dataSchemas = loadDataSchemas(
  path.join(import.meta.dirname, 'data', 'schemas')
)

const store = (entity, name) =>
  entityStore(collectionName(name), dataSchemas[entity], logger)

/**
 * Everything the routes need from this version. Its data access objects are
 * the ones the handlers call, so tests can spy on their functions.
 */
export const version = {
  apiVersion,
  logger,
  validators,
  movements: movementData(store('movement', 'movements')),
  collections: collectionData(store('collection', 'collections')),
  deliveries: deliveryData(store('delivery', 'deliveries')),
  receipts: receiptData(store('receipt', 'receipts'))
}

const routes = [
  createMovement,
  recordCollection,
  recordDelivery,
  recordReceipt,
  recordReceiptUndocumented
]

/**
 * The beta-3 API, registered under the `/beta-3` prefix (see router.js).
 * Needs the mongodb plugin registered first.
 */
export const beta3 = {
  plugin: {
    name: apiVersion,
    dependencies: ['mongodb'],
    register: async (server) => {
      await sweepStaleGenerations(server.db, apiVersion, DATA_GENERATION)
      for (const data of [
        version.movements,
        version.collections,
        version.deliveries,
        version.receipts
      ]) {
        await data.sync(server.db)
      }

      server.route(routes.map((route) => route(version)))
    }
  }
}
