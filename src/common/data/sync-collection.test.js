import { MongoClient } from 'mongodb'
import { syncCollection } from './sync-collection.js'

const collectionName = 'things'

const schema = (properties = {}) => ({
  bsonType: 'object',
  additionalProperties: false,
  required: ['_id', 'name'],
  properties: {
    _id: { bsonType: 'string' },
    name: { bsonType: 'string' },
    ...properties
  }
})

const logger = { info: vi.fn(), warn: vi.fn() }

describe('syncCollection', () => {
  let client
  let db

  const sync = (dataSchema) =>
    syncCollection(db, collectionName, { indexes: [], ...dataSchema }, logger)

  const storedOptions = async () =>
    (await db.listCollections({ name: collectionName }).toArray())[0].options

  const indexNames = async () =>
    (await db.collection(collectionName).indexes())
      .map(({ name }) => name)
      .sort()

  beforeAll(async () => {
    client = await MongoClient.connect(process.env.MONGO_URI)
    db = client.db('sync-collection-test')
  })

  beforeEach(() => db.dropDatabase())

  afterAll(async () => {
    await db.dropDatabase()
    await client.close()
  })

  describe('for a new collection', () => {
    test('creates it with the schema as its validator', async () => {
      await sync({ schema: schema() })

      expect(await storedOptions()).toMatchObject({
        validator: { $jsonSchema: schema() },
        validationLevel: 'strict',
        validationAction: 'error'
      })
    })

    test('so MongoDB rejects a badly shaped write from any client', async () => {
      await sync({ schema: schema() })
      const things = db.collection(collectionName)

      await things.insertOne({ _id: 'a', name: 'ok' })
      await expect(things.insertOne({ _id: 'b' })).rejects.toMatchObject({
        code: 121
      })
      await expect(
        things.insertOne({ _id: 'c', name: 'ok', extra: true })
      ).rejects.toMatchObject({ code: 121 })
    })

    test('carries on when another instance created it first', async () => {
      // It's created between this instance looking and creating it
      const create = db.createCollection.bind(db)
      vi.spyOn(db, 'createCollection').mockImplementationOnce(
        async (...args) => {
          await create(...args)
          throw Object.assign(new Error('exists'), { code: 48 })
        }
      )

      await expect(sync({ schema: schema() })).resolves.toBeUndefined()
      expect(await indexNames()).toEqual(['_id_'])
    })

    test('rethrows any other failure to create it', async () => {
      const failure = Object.assign(new Error('not authorised'), { code: 13 })
      vi.spyOn(db, 'createCollection').mockRejectedValueOnce(failure)

      await expect(sync({ schema: schema() })).rejects.toBe(failure)
    })
  })

  describe('for an existing collection', () => {
    const withOptional = schema({ note: { bsonType: 'string' } })

    test('updates the validator when the schema has changed', async () => {
      await sync({ schema: schema() })

      await sync({ schema: withOptional })

      expect((await storedOptions()).validator).toEqual({
        $jsonSchema: withOptional
      })
      expect(logger.info).toHaveBeenCalledWith(
        { collection: collectionName },
        `Updated the validator of ${collectionName}`
      )
    })

    test('leaves the validator alone when the schema has not changed', async () => {
      await sync({ schema: schema() })
      const command = vi.spyOn(db, 'command')

      await sync({ schema: schema() })

      expect(command).not.toHaveBeenCalled()
    })

    test('refuses to start when stored documents do not match the schema', async () => {
      await sync({ schema: withOptional })
      await db.collection(collectionName).insertOne({
        _id: 'a',
        name: 'ok',
        note: 'only allowed by the old schema'
      })

      await expect(sync({ schema: schema() })).rejects.toThrow(
        `${collectionName} holds documents that don't match its schema, e.g. a: bump DATA_GENERATION`
      )
    })

    test('refuses to start when the user cannot update the validator', async () => {
      await sync({ schema: schema() })
      vi.spyOn(db, 'command').mockRejectedValueOnce(
        Object.assign(new Error('not authorized'), { code: 13 })
      )

      await expect(sync({ schema: withOptional })).rejects.toThrow(
        `Can't update the validator of ${collectionName}, as that needs the dbAdmin role: bump DATA_GENERATION`
      )
    })

    test('rethrows any other failure to update the validator', async () => {
      await sync({ schema: schema() })
      const failure = new Error('network')
      vi.spyOn(db, 'command').mockRejectedValueOnce(failure)

      await expect(sync({ schema: withOptional })).rejects.toBe(failure)
    })
  })

  describe('indexes', () => {
    const byName = { name: 'name', key: { name: 1 } }

    test('creates the declared indexes', async () => {
      await sync({ schema: schema(), indexes: [byName] })

      expect(await indexNames()).toEqual(['_id_', 'name'])
    })

    test('drops the ones no longer declared', async () => {
      await sync({ schema: schema(), indexes: [byName] })

      await sync({ schema: schema(), indexes: [] })

      expect(await indexNames()).toEqual(['_id_'])
    })

    test('recreates one declared with a different key or uniqueness', async () => {
      await sync({ schema: schema(), indexes: [byName] })

      await sync({ schema: schema(), indexes: [{ ...byName, unique: true }] })

      const indexes = await db.collection(collectionName).indexes()
      expect(indexes.find(({ name }) => name === 'name')).toMatchObject({
        key: { name: 1 },
        unique: true
      })
    })

    test('ignores an index that is already gone', async () => {
      await sync({ schema: schema(), indexes: [byName] })
      const collection = db.collection(collectionName)
      vi.spyOn(db, 'collection').mockReturnValue(
        Object.assign(Object.create(collection), {
          dropIndex: () =>
            Promise.reject(Object.assign(new Error('gone'), { code: 27 }))
        })
      )

      await expect(
        sync({ schema: schema(), indexes: [] })
      ).resolves.toBeUndefined()
    })

    test('rethrows any other failure to drop one', async () => {
      await sync({ schema: schema(), indexes: [byName] })
      const collection = db.collection(collectionName)
      const failure = Object.assign(new Error('not authorised'), { code: 13 })
      vi.spyOn(db, 'collection').mockReturnValue(
        Object.assign(Object.create(collection), {
          dropIndex: () => Promise.reject(failure)
        })
      )

      await expect(sync({ schema: schema(), indexes: [] })).rejects.toBe(
        failure
      )
    })
  })
})
