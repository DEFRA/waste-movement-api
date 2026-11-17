import { MongoClient } from 'mongodb'
import { fromPayload } from '#/common/data/payload.js'
import { collectionName as versionCollectionName, version } from '../index.js'

const collectionName = versionCollectionName('collections')

const { sync, createCollectionRecord } = version.collections

const record = {
  movementId: '25HRA0B2',
  orgId: '57aed195-325e-45d5-b1fb-5f201e0324cf',
  traceId: 'trace-id-123',
  payload: { isDutyOfCareConfirmed: true }
}

describe('collection data', () => {
  let client
  let db

  beforeAll(async () => {
    client = await MongoClient.connect(process.env.MONGO_URI)
    db = client.db(`${version.apiVersion}-data-test`)
    await db.dropDatabase()
    await sync(db)
  })

  afterAll(async () => {
    await db.dropDatabase()
    await client.close()
  })

  describe('createCollectionRecord', () => {
    it('stores the request as sent, with its envelope, against its movementId', async () => {
      const result = await createCollectionRecord(db, record)

      const recordInDb = await db
        .collection(collectionName)
        .findOne({ _id: result._id })
      expect(recordInDb).toEqual(result)
      expect(recordInDb).toMatchObject({
        movementId: record.movementId,
        orgId: record.orgId,
        traceId: record.traceId,
        revision: 1
      })
      expect(fromPayload(recordInDb.payload)).toEqual(record.payload)
    })

    it('should handle database errors', async () => {
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
