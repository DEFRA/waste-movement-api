import { MongoClient } from 'mongodb'
import { fromPayload } from '#/common/data/payload.js'
import {
  collectionName as versionCollectionName,
  dataSchemas,
  version
} from '../index.js'

const collectionName = versionCollectionName('deliveries')

const {
  sync,
  findDeliveryMovementIds,
  createDeliveryRecords,
  createUndocumentedDeliveryRecord
} = version.deliveries

const orgId = '57aed195-325e-45d5-b1fb-5f201e0324cf'
const traceId = 'trace-id-123'

const failingDb = (error) => ({
  collection: vi.fn().mockImplementation(() => {
    throw error
  })
})

describe('delivery data', () => {
  let client
  let db
  let deliveriesCollection

  beforeAll(async () => {
    // The shared in-memory MongoDB is a replica set, because
    // createDeliveryRecords writes in a transaction.
    client = await MongoClient.connect(process.env.MONGO_URI)
    db = client.db(`${version.apiVersion}-data-test`)
    await db.dropDatabase()
    await sync(db)

    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterAll(async () => {
    await db.dropDatabase()
    await client.close()
    vi.useRealTimers()
  })

  beforeEach(async () => {
    deliveriesCollection = db.collection(collectionName)
    await deliveriesCollection.deleteMany({})
  })

  describe('sync', () => {
    it('indexes deliveryId without making it unique', async () => {
      const indexes = await deliveriesCollection.indexes()

      expect(indexes).toContainEqual(
        expect.objectContaining({ key: { deliveryId: 1 } })
      )
      expect(indexes.find(({ key }) => key.deliveryId)).not.toHaveProperty(
        'unique'
      )
    })
  })

  describe('findDeliveryMovementIds', () => {
    const storeGroupings = (groupings) =>
      createDeliveryRecords(
        db,
        client,
        { orgId, traceId, payload: {} },
        groupings.map((grouping) => ({
          wasteType: 'NON_HAZARDOUS',
          ...grouping
        }))
      )

    it('returns the movement ids delivered under the delivery id', async () => {
      await storeGroupings([
        { deliveryId: '25KMT4Z9', movementIds: ['25HRA0B2', '25HRA0B3'] }
      ])

      const result = await findDeliveryMovementIds(db, '25KMT4Z9')

      expect(result).toEqual(['25HRA0B2', '25HRA0B3'])
    })

    it('combines and deduplicates every record with the delivery id', async () => {
      // A resubmitted hazardous movement stores a second record
      await storeGroupings([
        { deliveryId: '25HRZ9X7', movementIds: ['25HRZ9X7'] },
        { deliveryId: '25HRZ9X7', movementIds: ['25HRZ9X7'] }
      ])

      const result = await findDeliveryMovementIds(db, '25HRZ9X7')

      expect(result).toEqual(['25HRZ9X7'])
    })

    it('returns an empty list for an undocumented receipt’s delivery', async () => {
      await createUndocumentedDeliveryRecord(db, {
        deliveryId: '25KMT4Z9',
        orgId,
        traceId
      })

      const result = await findDeliveryMovementIds(db, '25KMT4Z9')

      expect(result).toEqual([])
    })

    it('returns null when no delivery with the given id exists', async () => {
      const result = await findDeliveryMovementIds(db, '25KMT4Z9')

      expect(result).toBeNull()
    })
  })

  describe('createUndocumentedDeliveryRecord', () => {
    it('stores an empty delivery, with no payload of its own', async () => {
      const now = new Date()

      const result = await createUndocumentedDeliveryRecord(db, {
        deliveryId: '25KMT4Z9',
        orgId,
        traceId
      })

      expect(result).toEqual({ deliveryId: '25KMT4Z9' })
      expect(
        await deliveriesCollection.findOne({ deliveryId: '25KMT4Z9' })
      ).toEqual({
        _id: expect.any(Object),
        orgId,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        traceId,
        deliveryId: '25KMT4Z9',
        movementIds: []
      })
    })

    it('should handle database errors', async () => {
      const mockError = new Error('Database error')

      await expect(
        createUndocumentedDeliveryRecord(failingDb(mockError), {
          deliveryId: '25KMT4Z9',
          orgId,
          traceId
        })
      ).rejects.toThrow(mockError.message)
    })
  })

  describe('createDeliveryRecords', () => {
    const payload = { movementIds: ['25HRA0B1', '25HRA0B2', '25HRA0B4'] }
    const groupings = [
      {
        deliveryId: '25KMT4Z9',
        movementIds: ['25HRA0B1', '25HRA0B2'],
        wasteType: 'NON_HAZARDOUS'
      },
      {
        deliveryId: '25HRA0B4',
        movementIds: ['25HRA0B4'],
        wasteType: 'HAZARDOUS'
      },
      {
        deliveryId: '25HRA0B3',
        movementIds: ['25HRA0B3'],
        wasteType: 'HAZARDOUS'
      }
    ]
    const request = { orgId, traceId, payload }

    it('stores every delivery with the request, and returns them in input order', async () => {
      const now = new Date()

      const result = await createDeliveryRecords(db, client, request, groupings)

      const expected = groupings.map((grouping) => ({
        _id: expect.any(Object),
        orgId,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        traceId,
        payload: expect.anything(),
        ...grouping
      }))
      expect(result).toEqual(expected)

      const recordsInDb = await deliveriesCollection.find({}).toArray()
      expect(recordsInDb).toEqual(expected)
      expect(recordsInDb.map((record) => fromPayload(record.payload))).toEqual(
        groupings.map(() => payload)
      )
    })

    describe('when a write fails part-way through the batch', () => {
      // Rejects the second delivery, after the first has been written.
      const setValidator = (validator) =>
        db.command({ collMod: collectionName, validator })
      const schemaValidator = { $jsonSchema: dataSchemas.delivery.schema }

      beforeEach(() =>
        setValidator({
          $and: [
            schemaValidator,
            { deliveryId: { $ne: groupings[1].deliveryId } }
          ]
        })
      )
      afterEach(() => setValidator(schemaValidator))

      it('writes none of the deliveries', async () => {
        await expect(
          createDeliveryRecords(db, client, request, groupings)
        ).rejects.toThrow()

        expect(await deliveriesCollection.countDocuments()).toBe(0)
      })

      it('leaves exactly one copy of each delivery once a retry succeeds', async () => {
        await expect(
          createDeliveryRecords(db, client, request, groupings)
        ).rejects.toThrow()
        await setValidator(schemaValidator)

        await createDeliveryRecords(db, client, request, groupings)

        const recordsInDb = await deliveriesCollection
          .find({}, { projection: { _id: 0, deliveryId: 1 } })
          .toArray()
        expect(recordsInDb).toEqual(
          groupings.map(({ deliveryId }) => ({ deliveryId }))
        )
      })
    })

    it('should handle database errors', async () => {
      const mockError = new Error('Database error')

      await expect(
        createDeliveryRecords(failingDb(mockError), client, request, groupings)
      ).rejects.toThrow(mockError.message)
    })
  })
})
