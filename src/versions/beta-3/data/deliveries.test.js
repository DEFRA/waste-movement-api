import { MongoClient, ObjectId } from 'mongodb'
import { DocumentValidationError } from '#/common/data/entity-store.js'
import { fromPayload, hashPayload } from '#/common/data/payload.js'
import { syncDataSchemas } from '#/common/data/sync-data-schemas.js'
import { forwardedClient } from '#test/data/organisation-headers.js'
import {
  dataSchemas,
  collectionName as versionCollectionName,
  version
} from '../index.js'
import { hazardousWasteItem, wasteItem } from '../schemas/test-helpers.js'

const collectionName = versionCollectionName('deliveries')

const { deliveries: data } = version
const {
  findDeliveryMovementIds,
  createDeliveryRecords,
  createUndocumentedDeliveryRecord
} = data

const orgId = '57aed195-325e-45d5-b1fb-5f201e0324cf'
const requestId = 'e4f5a6b7-8293-4a4b-8d5e-6f7a8b9c0d1e'
const payload = { movementIds: ['25HRA0B1', '25HRA0B2', '25HRA0B4'] }
const request = { orgId, ...forwardedClient, requestId, payload }
// An undocumented receipt's delivery keeps the POST /receipts request
const undocumented = {
  deliveryId: '25KMT4Z9',
  orgId,
  ...forwardedClient,
  requestId,
  payload: { reasonForNoDeliveryId: 'No delivery was recorded' }
}

const failingDb = (error) => ({
  collection: vi.fn().mockImplementation(() => {
    throw error
  })
})

describe('delivery data', () => {
  // Connects on its first operation. The shared in-memory MongoDB is a
  // replica set, because createDeliveryRecords writes in a transaction.
  const client = new MongoClient(process.env.MONGO_URI)
  const db = client.db(`${version.apiVersion}-data-test`)
  const deliveriesCollection = db.collection(collectionName)

  const store = (deliveryId, movementIds, wasteType = 'NON_HAZARDOUS') =>
    createDeliveryRecords(db, client, request, [
      { deliveryId, movementIds, wasteType }
    ])

  beforeAll(async () => {
    await db.dropDatabase()
    await syncDataSchemas(db, [data], version.logger)

    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterAll(async () => {
    await db.dropDatabase()
    await client.close()
    vi.useRealTimers()
  })

  beforeEach(() => deliveriesCollection.deleteMany({}))

  describe('findDeliveryMovementIds', () => {
    it('returns the movement ids delivered under the delivery id', async () => {
      await store('25KMT4Z9', ['25HRA0B2', '25HRA0B3'])

      const result = await findDeliveryMovementIds(db, '25KMT4Z9')

      expect(result).toEqual(['25HRA0B2', '25HRA0B3'])
    })

    it('combines and deduplicates every record with the delivery id', async () => {
      // A resubmitted hazardous movement stores a second record
      await store('25HRZ9X7', ['25HRZ9X7'], 'HAZARDOUS')
      await store('25HRZ9X7', ['25HRZ9X7'], 'HAZARDOUS')

      const result = await findDeliveryMovementIds(db, '25HRZ9X7')

      expect(result).toEqual(['25HRZ9X7'])
    })

    it("returns an empty list for an undocumented receipt's delivery", async () => {
      await createUndocumentedDeliveryRecord(db, undocumented)

      const result = await findDeliveryMovementIds(db, '25KMT4Z9')

      expect(result).toEqual([])
    })

    it('returns null when no delivery with the given id exists', async () => {
      const result = await findDeliveryMovementIds(db, '25KMT4Z9')

      expect(result).toBeNull()
    })
  })

  describe('createUndocumentedDeliveryRecord', () => {
    it("stores an empty delivery with the undocumented receipt's request", async () => {
      const now = new Date()

      const result = await createUndocumentedDeliveryRecord(db, undocumented)

      expect(result).toEqual({ deliveryId: '25KMT4Z9' })
      expect(
        await deliveriesCollection.findOne({ deliveryId: '25KMT4Z9' })
      ).toEqual({
        _id: expect.any(ObjectId),
        orgId,
        ...forwardedClient,
        requestId,
        revision: 0,
        createdAt: now,
        updatedAt: now,
        payload: expect.anything(),
        payloadHash: hashPayload(undocumented.payload),
        deliveryId: '25KMT4Z9',
        movementIds: [],
        wasteType: 'NON_HAZARDOUS'
      })
    })

    it("is hazardous when any of the receipt's waste items declares hazardous properties", async () => {
      await createUndocumentedDeliveryRecord(db, {
        ...undocumented,
        payload: { wasteItems: [wasteItem, hazardousWasteItem] }
      })

      expect(
        await deliveriesCollection.findOne({ deliveryId: '25KMT4Z9' })
      ).toMatchObject({ wasteType: 'HAZARDOUS' })
    })

    it('handles database errors', async () => {
      const mockError = new Error('Database error')

      await expect(
        createUndocumentedDeliveryRecord(failingDb(mockError), undocumented)
      ).rejects.toThrow(mockError.message)
    })
  })

  describe('createDeliveryRecords', () => {
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

    it('stores every delivery in input order, sharing the request and its requestId', async () => {
      const now = new Date()

      const result = await createDeliveryRecords(db, client, request, groupings)

      const recordsInDb = await deliveriesCollection
        .find({ requestId })
        .toArray()

      expect(recordsInDb).toEqual(result)
      expect(recordsInDb).toEqual(
        groupings.map((grouping) => ({
          _id: expect.any(ObjectId),
          orgId,
          ...forwardedClient,
          requestId,
          revision: 0,
          createdAt: now,
          updatedAt: now,
          payload: expect.anything(),
          payloadHash: hashPayload(payload),
          ...grouping
        }))
      )
      recordsInDb.forEach((record) =>
        expect(fromPayload(record.payload)).toEqual(payload)
      )
    })

    it('is rejected before the write when it does not match the DB schema', async () => {
      const [nonHazardous] = groupings

      await expect(
        createDeliveryRecords(db, client, request, [
          { ...nonHazardous, wasteType: 'UNKNOWN' }
        ])
      ).rejects.toBeInstanceOf(DocumentValidationError)

      expect(await deliveriesCollection.countDocuments()).toBe(0)
    })

    describe('when a write fails part-way through the batch', () => {
      // Rejects the second delivery, after the first has been written, then
      // puts the collection's own validator back.
      const schemaValidator = { $jsonSchema: dataSchemas.delivery.schema }
      const [, second] = groupings
      const setValidator = (validator) =>
        db.command({ collMod: collectionName, validator })

      beforeEach(() =>
        setValidator({
          $and: [schemaValidator, { deliveryId: { $ne: second.deliveryId } }]
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

    it('handles database errors', async () => {
      const mockError = new Error('Database error')

      await expect(
        createDeliveryRecords(failingDb(mockError), client, request, groupings)
      ).rejects.toThrow(mockError.message)
    })
  })
})
