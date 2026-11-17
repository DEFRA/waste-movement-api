import { MongoClient } from 'mongodb'
import { fromPayload } from '#/common/data/payload.js'
import { collectionName as versionCollectionName, version } from '../index.js'
import { hazardousWasteItem, wasteItem } from '../schemas/test-helpers.js'

const collectionName = versionCollectionName('movements')

const { sync, getMovementRecord, findMovements, createMovementRecord } =
  version.movements

const orgId = '57aed195-325e-45d5-b1fb-5f201e0324cf'
const traceId = 'trace-id-123'
const movement = (movementId, wasteItems = [wasteItem]) => ({
  movementId,
  orgId,
  traceId,
  payload: { wasteItems }
})

const failingDb = (error) => ({
  collection: vi.fn().mockImplementation(() => {
    throw error
  })
})

describe('movement data', () => {
  let client
  let db
  let movementsCollection

  beforeAll(async () => {
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
    movementsCollection = db.collection(collectionName)
    await movementsCollection.deleteMany({})
  })

  describe('createMovementRecord', () => {
    it('stores the request as sent, with its envelope, under its movementId', async () => {
      const now = new Date()

      const result = await createMovementRecord(db, movement('25HRA0B2'))

      expect(result).toEqual({ movementId: '25HRA0B2' })
      const recordInDb = await movementsCollection.findOne({ _id: '25HRA0B2' })
      expect(recordInDb).toEqual({
        _id: '25HRA0B2',
        orgId,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        traceId,
        payload: expect.anything(),
        isHazardous: false
      })
      expect(fromPayload(recordInDb.payload)).toEqual({
        wasteItems: [wasteItem]
      })
    })

    it('stores whether any waste item declares hazardous properties', async () => {
      await createMovementRecord(
        db,
        movement('25HRA0B2', [wasteItem, hazardousWasteItem])
      )

      expect(
        await movementsCollection.findOne({ _id: '25HRA0B2' })
      ).toMatchObject({ isHazardous: true })
    })

    it('rejects a movementId that is already stored', async () => {
      await createMovementRecord(db, movement('25HRA0B2'))

      await expect(
        createMovementRecord(db, movement('25HRA0B2'))
      ).rejects.toMatchObject({ code: 11000 })
    })

    it('rejects a document that does not match the schema, without writing it', async () => {
      await expect(
        createMovementRecord(db, { ...movement('25HRA0B2'), orgId: 42 })
      ).rejects.toMatchObject({ name: 'DocumentValidationError' })

      expect(await movementsCollection.countDocuments()).toBe(0)
    })

    it('should handle database errors', async () => {
      const mockError = new Error('Database error')

      await expect(
        createMovementRecord(failingDb(mockError), movement('25HRA0B2'))
      ).rejects.toThrow(mockError.message)
    })
  })

  describe('getMovementRecord', () => {
    it('should get a movement with the given movementId', async () => {
      await createMovementRecord(db, movement('25HRA0B2'))

      const recordInDb = await getMovementRecord(db, '25HRA0B2')

      expect(recordInDb).toMatchObject({ _id: '25HRA0B2', orgId })
    })

    it('should return null when a movementId is not found', async () => {
      const recordInDb = await getMovementRecord(db, 'nonExistentId')

      expect(recordInDb).toBeNull()
    })

    it('should handle database errors', async () => {
      const mockError = new Error('Database error')

      await expect(
        getMovementRecord(failingDb(mockError), '25HRA0B2')
      ).rejects.toThrow(mockError.message)
    })
  })

  describe('findMovements', () => {
    it('returns the movements that exist, with only whether each is hazardous', async () => {
      await createMovementRecord(db, movement('25HRA0B1', [hazardousWasteItem]))
      await createMovementRecord(db, movement('25HRA0B2', []))

      const result = await findMovements(db, [
        '25HRA0B1',
        '25HRA0B2',
        '25HRA0B3'
      ])

      expect(result).toEqual(
        expect.arrayContaining([
          { movementId: '25HRA0B1', isHazardous: true },
          { movementId: '25HRA0B2', isHazardous: false }
        ])
      )
      expect(result).toHaveLength(2)
    })

    it('returns an empty array when none exist', async () => {
      const result = await findMovements(db, ['25HRA0B1'])

      expect(result).toEqual([])
    })
  })
})
