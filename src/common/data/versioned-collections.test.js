import { MongoClient } from 'mongodb'
import { createLogger } from '#/common/helpers/logging/logger.js'
import {
  sweepStaleGenerations,
  versionedCollections
} from './versioned-collections.js'

describe('versionedCollections', () => {
  test('names a collection for an API version and data generation', () => {
    expect(versionedCollections('beta-3', 1)('movements')).toBe(
      'beta-3-g1-movements'
    )
  })
})

describe('sweepStaleGenerations', () => {
  let client
  let db

  const collectionNames = async () =>
    (await db.listCollections({}, { nameOnly: true }).toArray())
      .map(({ name }) => name)
      .sort()

  beforeAll(async () => {
    client = await MongoClient.connect(process.env.MONGO_URI)
    db = client.db('versioned-collections-test')
  })

  beforeEach(async () => {
    await db.dropDatabase()
    for (const name of [
      'beta-3-g0-movements',
      'beta-3-g0-deliveries',
      'beta-3-g1-movements',
      'beta-3-g1-deliveries',
      'beta-3-r1-movements',
      'beta-30-g0-movements',
      'beta-4-g0-movements',
      'beta-3-movements'
    ]) {
      await db.createCollection(name)
    }
  })

  afterAll(async () => {
    await db.dropDatabase()
    await client.close()
  })

  test("drops the version's collections for other generations, and its old revision-named ones", async () => {
    const dropped = await sweepStaleGenerations(db, 'beta-3', 1)

    expect(dropped.sort()).toEqual([
      'beta-3-g0-deliveries',
      'beta-3-g0-movements',
      'beta-3-r1-movements'
    ])
    expect(await collectionNames()).toEqual([
      'beta-3-g1-deliveries',
      'beta-3-g1-movements',
      'beta-3-movements',
      'beta-30-g0-movements',
      'beta-4-g0-movements'
    ])
  })

  test('logs each drop', async () => {
    const infoSpy = vi.spyOn(createLogger(), 'info')

    await sweepStaleGenerations(db, 'beta-3', 1)

    expect(infoSpy).toHaveBeenCalledWith(
      {
        apiVersion: 'beta-3',
        generation: 1,
        collection: 'beta-3-g0-movements'
      },
      'Dropped beta-3-g0-movements, a stale beta-3 data generation'
    )
  })

  test('ignores a collection that is already gone', async () => {
    // As when another instance's sweep got there first. (MongoDB 7 drops a
    // missing collection without complaint, but older servers reject it.)
    const namespaceNotFound = Object.assign(new Error('ns not found'), {
      code: 26
    })
    vi.spyOn(db, 'collection').mockReturnValue({
      drop: () => Promise.reject(namespaceNotFound)
    })

    await expect(sweepStaleGenerations(db, 'beta-3', 1)).resolves.toHaveLength(
      3
    )
  })

  test('rethrows any other failure to drop', async () => {
    const failure = Object.assign(new Error('not authorised'), { code: 13 })
    vi.spyOn(db, 'collection').mockReturnValue({
      drop: () => Promise.reject(failure)
    })

    await expect(sweepStaleGenerations(db, 'beta-3', 1)).rejects.toBe(failure)
  })
})
