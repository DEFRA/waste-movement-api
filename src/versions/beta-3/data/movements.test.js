import { MongoClient } from 'mongodb'
import { collectionName as versionCollectionName, version } from '../index.js'
import { movementData } from './movements.js'

const collectionName = versionCollectionName('movements')

const {
  createIndexes,
  getMovementRecord,
  findMovements,
  createMovementRecord
} = movementData(collectionName)

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
    await createIndexes(db)

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

  describe('createIndexes', () => {
    it('makes movementId unique', async () => {
      await movementsCollection.insertOne({ movementId: '25HRA0B1' })

      await expect(
        movementsCollection.insertOne({ movementId: '25HRA0B1' })
      ).rejects.toMatchObject({ code: 11000 })
    })
  })

  describe('getMovementRecord', () => {
    it('should get a movement with the given movementId ', async () => {
      const id = 'ourGeneratedId'
      const now = new Date().toISOString()
      const mockMovement = { movementId: id }

      const result = await createMovementRecord(db, mockMovement)

      const recordInDb = await getMovementRecord(db, id)

      expect(result).toEqual({ movementId: id })

      expect(recordInDb).toEqual({
        _id: expect.any(Object),
        createdAt: now,
        movementId: id
      })
    })

    it('should return null when a movmentId is not found', async () => {
      const recordInDb = await getMovementRecord(db, 'nonExistentId')

      expect(recordInDb).toBeNull()
    })

    it('should handle database errors ', async () => {
      const mockError = new Error('Database error')

      await expect(
        getMovementRecord(failingDb(mockError), 'ourGeneratedId')
      ).rejects.toThrow(mockError.message)
    })
  })

  describe('findMovements', () => {
    const classification = {
      wasteDescription: 'Fluorescent tubes',
      ewcCodes: ['200121']
    }

    it("returns the movements that exist, with only their waste items' classifications", async () => {
      await movementsCollection.insertMany([
        {
          movementId: '25HRA0B1',
          orgId: 'org',
          wasteItems: [{ classification, physicalDetails: { form: 'SOLID' } }]
        },
        { movementId: '25HRA0B2', orgId: 'org', wasteItems: [] }
      ])

      const result = await findMovements(db, [
        '25HRA0B1',
        '25HRA0B2',
        '25HRA0B3'
      ])

      expect(result).toEqual(
        expect.arrayContaining([
          { movementId: '25HRA0B1', wasteItems: [{ classification }] },
          { movementId: '25HRA0B2', wasteItems: [] }
        ])
      )
      expect(result).toHaveLength(2)
    })

    it('omits wasteItems for a movement stored without them', async () => {
      await movementsCollection.insertOne({ movementId: '25HRA0B1' })

      const result = await findMovements(db, ['25HRA0B1'])

      expect(result).toEqual([{ movementId: '25HRA0B1' }])
    })

    it('returns an empty array when none exist', async () => {
      const result = await findMovements(db, ['25HRA0B1'])

      expect(result).toEqual([])
    })
  })

  describe('createMovementRecord', () => {
    it('should create a movement in the db and return the movementId', async () => {
      const movementId = '25HRA0B2'
      const now = new Date().toISOString()
      const mockMovement = {
        movementId,
        orgId: '57aed195-325e-45d5-b1fb-5f201e0324cf'
      }

      const result = await createMovementRecord(db, mockMovement)

      const recordInDb = await movementsCollection.findOne({
        movementId
      })

      expect(result).toEqual({ movementId })

      expect(recordInDb).toEqual({
        _id: expect.any(Object),
        createdAt: now,
        ...mockMovement
      })
    })

    it('rejects a movementId that is already stored', async () => {
      await createMovementRecord(db, { movementId: '25HRA0B2' })

      await expect(
        createMovementRecord(db, { movementId: '25HRA0B2' })
      ).rejects.toMatchObject({ code: 11000 })
    })

    it('should handle database errors ', async () => {
      const mockError = new Error('Database error')

      await expect(
        createMovementRecord(failingDb(mockError), { movementId: '25HRA0B2' })
      ).rejects.toThrow(mockError.message)
    })
  })
})
