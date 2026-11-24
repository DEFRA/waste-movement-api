import { MongoClient } from 'mongodb'
import { syncDataSchemas } from '#/common/data/sync-data-schemas.js'
import {
  dataSchemas,
  collectionName as versionCollectionName,
  version
} from '../index.js'
import { movementData } from './movements.js'

const collectionName = versionCollectionName('movements')

const movements = movementData(collectionName, dataSchemas.movement)
const { getMovementRecord, findMovements, createMovementRecord } = movements

const orgId = '57aed195-325e-45d5-b1fb-5f201e0324cf'

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
    await syncDataSchemas(db, [movements], version.logger)

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

  describe('getMovementRecord', () => {
    it('should get a movement with the given movementId ', async () => {
      const id = 'ourGeneratedId'
      const now = new Date().toISOString()
      const mockMovement = { movementId: id, orgId, wasteItems: [] }

      const result = await createMovementRecord(db, mockMovement)

      const recordInDb = await getMovementRecord(db, id)

      expect(result).toEqual({ movementId: id })

      expect(recordInDb).toEqual({
        _id: expect.any(Object),
        createdAt: now,
        ...mockMovement
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
      await createMovementRecord(db, {
        movementId: '25HRA0B1',
        orgId,
        wasteItems: [{ classification, physicalDetails: { form: 'SOLID' } }]
      })
      await createMovementRecord(db, {
        movementId: '25HRA0B2',
        orgId,
        wasteItems: []
      })

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

    it('returns an empty array when none exist', async () => {
      const result = await findMovements(db, ['25HRA0B1'])

      expect(result).toEqual([])
    })
  })

  describe('createMovementRecord', () => {
    it('should create a movement in the db and return the movementId', async () => {
      const movementId = '25HRA0B2'
      const now = new Date().toISOString()
      const mockMovement = { movementId, orgId, wasteItems: [] }

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
      const movement = { movementId: '25HRA0B2', orgId, wasteItems: [] }
      await createMovementRecord(db, movement)

      await expect(createMovementRecord(db, movement)).rejects.toMatchObject({
        code: 11000
      })
    })

    it('is rejected by the collection validator when it does not match the DB schema', async () => {
      await expect(
        createMovementRecord(db, { movementId: '25HRA0B2', orgId })
      ).rejects.toMatchObject({ code: 121 })

      expect(await movementsCollection.countDocuments()).toBe(0)
    })

    it('should handle database errors ', async () => {
      const mockError = new Error('Database error')

      await expect(
        createMovementRecord(failingDb(mockError), {
          movementId: '25HRA0B2',
          orgId,
          wasteItems: []
        })
      ).rejects.toThrow(mockError.message)
    })
  })
})
