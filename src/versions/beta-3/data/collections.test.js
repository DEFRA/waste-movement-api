import { MongoClient, ObjectId } from 'mongodb'
import { DocumentValidationError } from '#/common/data/entity-store.js'
import { fromPayload, hashPayload } from '#/common/data/payload.js'
import { syncDataSchemas } from '#/common/data/sync-data-schemas.js'
import { forwardedClient } from '#test/data/organisation-headers.js'
import { collectionName as versionCollectionName, version } from '../index.js'

const collectionName = versionCollectionName('collections')

const { createCollectionRecord } = version.collections

const record = {
  movementId: '25HRA0B2',
  orgId: '57aed195-325e-45d5-b1fb-5f201e0324cf',
  ...forwardedClient,
  requestId: 'c2d3e4f5-6071-4829-8b3c-4d5e6f7a8b9c',
  payload: { isDutyOfCareConfirmed: true }
}

describe('collection data', () => {
  // Connects on its first operation
  const client = new MongoClient(process.env.MONGO_URI)
  const db = client.db(`${version.apiVersion}-data-test`)

  beforeAll(async () => {
    await db.dropDatabase()
    await syncDataSchemas(db, [version.collections], version.logger)

    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterAll(async () => {
    await db.dropDatabase()
    await client.close()
    vi.useRealTimers()
  })

  beforeEach(() => db.collection(collectionName).deleteMany({}))

  describe('createCollectionRecord', () => {
    it('stores the request as sent, with its envelope, against its movementId', async () => {
      const now = new Date()

      const result = await createCollectionRecord(db, record)

      const recordInDb = await db
        .collection(collectionName)
        .findOne({ movementId: record.movementId })
      expect(recordInDb).toEqual(result)
      expect(recordInDb).toEqual({
        _id: expect.any(ObjectId),
        orgId: record.orgId,
        clientId: record.clientId,
        clientName: record.clientName,
        requestId: record.requestId,
        revision: 0,
        createdAt: now,
        updatedAt: now,
        payload: expect.anything(),
        payloadHash: hashPayload(record.payload),
        movementId: record.movementId
      })
      expect(fromPayload(recordInDb.payload)).toEqual(record.payload)
    })

    it('finds the Collection stored for a movement', async () => {
      const stored = await createCollectionRecord(db, record)

      expect(
        await version.collections.findCollectionRecord(db, record.movementId)
      ).toEqual(stored)
    })

    it('rejects a second Collection for the same movement, keeping the first', async () => {
      const first = await createCollectionRecord(db, record)

      await expect(
        createCollectionRecord(db, { ...record, requestId: 'another-request' })
      ).rejects.toMatchObject({ code: 11000 })

      expect(await db.collection(collectionName).find({}).toArray()).toEqual([
        first
      ])
    })

    it('is rejected before the write when it does not match the DB schema', async () => {
      await expect(
        createCollectionRecord(db, { ...record, movementId: undefined })
      ).rejects.toBeInstanceOf(DocumentValidationError)

      expect(await db.collection(collectionName).countDocuments()).toBe(0)
    })

    it('handles database errors', async () => {
      const mockError = new Error('Database error')
      const failingDb = {
        collection: vi.fn().mockImplementation(() => {
          throw mockError
        })
      }

      await expect(createCollectionRecord(failingDb, record)).rejects.toThrow(
        mockError.message
      )
    })
  })
})
