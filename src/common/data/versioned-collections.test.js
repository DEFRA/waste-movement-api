import { MongoClient } from 'mongodb'
import { createLogger } from '#/common/helpers/logging/logger.js'
import {
  sweepStaleRevisions,
  versionedCollections
} from './versioned-collections.js'

describe('versionedCollections', () => {
  test('names a collection for an API version and data revision', () => {
    expect(versionedCollections('beta-3', 1)('movements')).toBe(
      'beta-3-r1-movements'
    )
  })
})

describe('sweepStaleRevisions', () => {
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
      'beta-3-r0-movements',
      'beta-3-r0-deliveries',
      'beta-3-r1-movements',
      'beta-3-r1-deliveries',
      'beta-30-r0-movements',
      'beta-4-r0-movements',
      'beta-3-movements'
    ]) {
      await db.createCollection(name)
    }
  })

  afterAll(async () => {
    await db.dropDatabase()
    await client.close()
  })

  test("drops the version's collections for other revisions only", async () => {
    const dropped = await sweepStaleRevisions(db, 'beta-3', 1)

    expect(dropped.sort()).toEqual([
      'beta-3-r0-deliveries',
      'beta-3-r0-movements'
    ])
    expect(await collectionNames()).toEqual([
      'beta-3-movements',
      'beta-3-r1-deliveries',
      'beta-3-r1-movements',
      'beta-30-r0-movements',
      'beta-4-r0-movements'
    ])
  })

  test('logs each drop', async () => {
    const infoSpy = vi.spyOn(createLogger(), 'info')

    await sweepStaleRevisions(db, 'beta-3', 1)

    expect(infoSpy).toHaveBeenCalledWith(
      {
        apiVersion: 'beta-3',
        revision: 1,
        collection: 'beta-3-r0-movements'
      },
      'Dropped beta-3-r0-movements, a stale beta-3 data revision'
    )
    infoSpy.mockRestore()
  })

  test('ignores a collection that is already gone', async () => {
    // As when another instance's sweep got there first. (MongoDB 7 drops a
    // missing collection without complaint, but older servers reject it.)
    const namespaceNotFound = Object.assign(new Error('ns not found'), {
      code: 26
    })
    const collectionSpy = vi
      .spyOn(db, 'collection')
      .mockReturnValue({ drop: () => Promise.reject(namespaceNotFound) })

    await expect(sweepStaleRevisions(db, 'beta-3', 1)).resolves.toHaveLength(2)
    collectionSpy.mockRestore()
  })

  test('rethrows any other failure to drop', async () => {
    const failure = Object.assign(new Error('not authorised'), { code: 13 })
    const collectionSpy = vi
      .spyOn(db, 'collection')
      .mockReturnValue({ drop: () => Promise.reject(failure) })

    await expect(sweepStaleRevisions(db, 'beta-3', 1)).rejects.toBe(failure)
    collectionSpy.mockRestore()
  })
})
