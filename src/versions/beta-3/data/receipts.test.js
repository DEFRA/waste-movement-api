import { MongoClient, ObjectId } from 'mongodb'
import { DocumentValidationError } from '#/common/data/entity-store.js'
import { fromPayload, hashPayload } from '#/common/data/payload.js'
import { syncDataSchemas } from '#/common/data/sync-data-schemas.js'
import { withTransaction } from '#/common/data/with-transaction.js'
import { collectionName as versionCollectionName, version } from '../index.js'

const collectionName = versionCollectionName('receipts')

const { createReceiptRecord } = version.receipts

const record = {
  deliveryId: '25KMT4Z9',
  orgId: '57aed195-325e-45d5-b1fb-5f201e0324cf',
  requestId: 'a6b7c8d9-a4b5-4c6d-8f70-8b9c0d1e2f3a',
  payload: { receiptDateTime: '2026-01-16T07:30:00Z' }
}

describe('receipt data', () => {
  // Connects on its first operation
  const client = new MongoClient(process.env.MONGO_URI)
  const db = client.db(`${version.apiVersion}-data-test`)

  beforeAll(async () => {
    await db.dropDatabase()
    await syncDataSchemas(db, [version.receipts], version.logger)

    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterAll(async () => {
    await db.dropDatabase()
    await client.close()
    vi.useRealTimers()
  })

  beforeEach(() => db.collection(collectionName).deleteMany({}))

  describe('createReceiptRecord', () => {
    it('stores the request as sent, with its envelope, against its deliveryId', async () => {
      const now = new Date()

      const result = await createReceiptRecord(db, record)

      const recordInDb = await db
        .collection(collectionName)
        .findOne({ deliveryId: record.deliveryId })
      expect(recordInDb).toEqual(result)
      expect(recordInDb).toEqual({
        _id: expect.any(ObjectId),
        orgId: record.orgId,
        requestId: record.requestId,
        revision: 0,
        createdAt: now,
        updatedAt: now,
        payload: expect.anything(),
        payloadHash: hashPayload(record.payload),
        deliveryId: record.deliveryId
      })
      expect(fromPayload(recordInDb.payload)).toEqual(record.payload)
    })

    it('finds the receipt stored for a delivery', async () => {
      const stored = await createReceiptRecord(db, record)

      expect(
        await version.receipts.findReceiptRecord(db, record.deliveryId)
      ).toEqual(stored)
    })

    it('rejects a second receipt for the same delivery, keeping the first', async () => {
      const first = await createReceiptRecord(db, record)

      await expect(
        createReceiptRecord(db, { ...record, requestId: 'another-request' })
      ).rejects.toMatchObject({ code: 11000 })

      expect(await db.collection(collectionName).find({}).toArray()).toEqual([
        first
      ])
    })

    it('writes in the session it is given', async () => {
      await expect(
        withTransaction(client, async (session) => {
          await createReceiptRecord(db, record, { session })
          throw new Error('Aborted')
        })
      ).rejects.toThrow('Aborted')

      expect(await db.collection(collectionName).countDocuments()).toBe(0)
    })

    it('is rejected before the write when it does not match the DB schema', async () => {
      await expect(
        createReceiptRecord(db, { ...record, orgId: undefined })
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

      await expect(createReceiptRecord(failingDb, record)).rejects.toThrow(
        mockError.message
      )
    })
  })
})
