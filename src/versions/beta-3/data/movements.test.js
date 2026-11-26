import { MongoClient, ObjectId } from 'mongodb'
import { DocumentValidationError } from '#/common/data/entity-store.js'
import { fromPayload, hashPayload } from '#/common/data/payload.js'
import { syncDataSchemas } from '#/common/data/sync-data-schemas.js'
import { forwardedClient } from '#test/data/organisation-headers.js'
import { collectionName as versionCollectionName, version } from '../index.js'
import { hazardousWasteItem, wasteItem } from '../schemas/test-helpers.js'

const collectionName = versionCollectionName('movements')

const { movements } = version
const { getMovementRecord, findMovements, createMovementRecord } = movements

const orgId = '57aed195-325e-45d5-b1fb-5f201e0324cf'
const requestId = 'a8f2c3e1-4b5d-4c6e-9f70-1a2b3c4d5e6f'

const movement = (movementId, wasteItems = [wasteItem]) => ({
  movementId,
  orgId,
  ...forwardedClient,
  requestId,
  payload: { wasteItems }
})

const failingDb = (error) => ({
  collection: vi.fn().mockImplementation(() => {
    throw error
  })
})

describe('movement data', () => {
  // Connects on its first operation
  const client = new MongoClient(process.env.MONGO_URI)
  const db = client.db(`${version.apiVersion}-data-test`)
  const movementsCollection = db.collection(collectionName)

  beforeAll(async () => {
    await db.dropDatabase()
    await syncDataSchemas(db, [movements], version.logger)

    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterAll(async () => {
    await db.dropDatabase()
    await client.close()
    vi.useRealTimers()
  })

  beforeEach(() => movementsCollection.deleteMany({}))

  describe('getMovementRecord', () => {
    it('gets the movement with the given movementId', async () => {
      await createMovementRecord(db, movement('25HRA0B2'))

      expect(await getMovementRecord(db, '25HRA0B2')).toMatchObject({
        movementId: '25HRA0B2'
      })
    })

    it('returns null when a movementId is not found', async () => {
      expect(await getMovementRecord(db, 'nonExistentId')).toBeNull()
    })

    it('handles database errors', async () => {
      const mockError = new Error('Database error')

      await expect(
        getMovementRecord(failingDb(mockError), '25HRA0B2')
      ).rejects.toThrow(mockError.message)
    })
  })

  describe('findMovements', () => {
    it('returns the movements that exist, with only whether each is hazardous', async () => {
      await createMovementRecord(db, movement('25HRA0B1', [hazardousWasteItem]))
      await createMovementRecord(db, movement('25HRA0B2'))

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
      expect(await findMovements(db, ['25HRA0B1'])).toEqual([])
    })
  })

  describe('createMovementRecord', () => {
    it('stores the envelope, the request as sent and whether it is hazardous', async () => {
      const now = new Date()
      const input = movement('25HRA0B2')

      const result = await createMovementRecord(db, input)
      const recordInDb = await movementsCollection.findOne({
        movementId: '25HRA0B2'
      })

      expect(result).toEqual({ movementId: '25HRA0B2' })
      expect(recordInDb).toEqual({
        _id: expect.any(ObjectId),
        orgId,
        ...forwardedClient,
        requestId,
        revision: 0,
        createdAt: now,
        updatedAt: now,
        payload: expect.anything(),
        payloadHash: hashPayload(input.payload),
        movementId: '25HRA0B2',
        isHazardous: false
      })
      expect(fromPayload(recordInDb.payload)).toEqual(input.payload)
    })

    it('rejects a movementId that is already stored', async () => {
      await createMovementRecord(db, movement('25HRA0B2'))

      await expect(
        createMovementRecord(db, movement('25HRA0B2'))
      ).rejects.toMatchObject({ code: 11000 })
    })

    it('is rejected before the write when it does not match the DB schema', async () => {
      await expect(
        createMovementRecord(db, { ...movement('25HRA0B2'), requestId: 1 })
      ).rejects.toBeInstanceOf(DocumentValidationError)

      expect(await movementsCollection.countDocuments()).toBe(0)
    })

    it('handles database errors', async () => {
      const mockError = new Error('Database error')

      await expect(
        createMovementRecord(failingDb(mockError), movement('25HRA0B2'))
      ).rejects.toThrow(mockError.message)
    })
  })
})
