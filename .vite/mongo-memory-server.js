import { setup, teardown } from 'vitest-mongodb'

// Vitest globalSetup: one in-memory MongoDB for the whole run, a one-node
// replica set, as recording deliveries writes in a transaction. It starts
// before any test worker, so they inherit MONGO_URI and config picks it up on
// import. Test files run one at a time (fileParallelism: false), so they can
// share it.
export default async function () {
  await setup({
    type: 'replSet',
    serverOptions: {
      replSet: { count: 1, storageEngine: 'wiredTiger' }
    }
  })
  process.env.MONGO_URI = globalThis.__MONGO_URI__

  return teardown
}
