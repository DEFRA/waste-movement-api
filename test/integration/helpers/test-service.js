import { MongoClient } from 'mongodb'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { createTestMongoDb } from '@defra/waste-movement-utils'
import { config } from '#/config.js'
import { createServer } from '#/server.js'

// Boots the real service - real MongoDB (in-memory replica set, so
// transactions work), real Hapi server, real socket on an ephemeral port.
//
// `wasteTrackingUrl` points the service's waste-tracking-id-backend client at
// a stub (see waste-tracking-stub.js); suites that don't need it can omit it.
export async function startTestService({ wasteTrackingUrl } = {}) {
  // The factory takes its dependencies rather than importing them, so it
  // works outside Jest. Its replica set binds a fixed port (17017), so test
  // files can't run concurrently.
  const { client, db, mongoUri, replicaSet } = await createTestMongoDb({
    config,
    MongoClient,
    MongoMemoryReplSet,
    useReplicaSet: true
  })

  // The factory doesn't write the URI back to config.
  config.set('mongo.mongoUrl', mongoUri)
  config.set('host', '127.0.0.1')
  config.set('port', 0)
  if (wasteTrackingUrl) {
    config.set('wasteTrackingUrl', wasteTrackingUrl)
  }

  const server = await createServer()
  await server.start()

  // 127.0.0.1, not server.info.uri, which reports the unfetchable 0.0.0.0.
  const baseUrl = `http://127.0.0.1:${server.info.port}`

  return {
    baseUrl,
    server,
    db,
    async stop() {
      await server.stop()
      await client.close()
      await replicaSet.stop()
    }
  }
}
