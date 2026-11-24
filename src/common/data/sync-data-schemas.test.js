import { MongoClient } from 'mongodb'
import {
  DataSchemaMismatchError,
  syncDataSchemas
} from './sync-data-schemas.js'

const collectionName = 'things'

const schema = (properties = {}, required = []) => ({
  bsonType: 'object',
  additionalProperties: false,
  required: ['_id', 'name', ...required],
  properties: {
    _id: { bsonType: 'string' },
    name: { bsonType: 'string' },
    ...properties
  }
})

const byName = { name: 'name_1', key: { name: 1 } }

const logger = { info: vi.fn() }

describe('syncDataSchemas', () => {
  let client
  let db

  const sync = ({ schema: thingSchema = schema(), indexes = [byName] } = {}) =>
    syncDataSchemas(
      db,
      [{ collectionName, dataSchema: { schema: thingSchema, indexes } }],
      logger
    )

  const storedOptions = async () => {
    const [{ options }] = await db
      .listCollections({ name: collectionName })
      .toArray()
    return options
  }

  const storedIndexes = async () =>
    (await db.collection(collectionName).indexes())
      .filter(({ name }) => name !== '_id_')
      .map(({ name, key, unique }) => ({ name, key, unique }))

  beforeAll(async () => {
    client = await MongoClient.connect(process.env.MONGO_URI)
    db = client.db('sync-data-schemas-test')
  })

  beforeEach(() => db.dropDatabase())

  afterAll(async () => {
    await db.dropDatabase()
    await client.close()
  })

  describe('for a new collection', () => {
    test('creates it with the schema as its validator, and its indexes', async () => {
      await sync()

      expect(await storedOptions()).toMatchObject({
        validator: { $jsonSchema: schema() },
        validationLevel: 'strict',
        validationAction: 'error'
      })
      expect(await storedIndexes()).toEqual([
        { name: 'name_1', key: { name: 1 }, unique: undefined }
      ])
    })

    test('so MongoDB rejects a badly shaped write from any client', async () => {
      await sync()
      const things = db.collection(collectionName)

      await things.insertOne({ _id: 'a', name: 'ok' })
      await expect(things.insertOne({ _id: 'b' })).rejects.toMatchObject({
        code: 121
      })
      await expect(
        things.insertOne({ _id: 'c', name: 'ok', extra: true })
      ).rejects.toMatchObject({ code: 121 })
    })

    test('creates a unique index as unique', async () => {
      await sync({
        indexes: [{ name: 'name_1', key: { name: 1 }, unique: true }]
      })

      expect(await storedIndexes()).toEqual([
        { name: 'name_1', key: { name: 1 }, unique: true }
      ])
    })

    test('refuses when another instance created it first from a different schema', async () => {
      // It's created between this instance looking for it and creating it
      const create = db.createCollection.bind(db)
      vi.spyOn(db, 'createCollection').mockImplementationOnce(
        async (name, options) => {
          await create(name, {
            ...options,
            validator: { $jsonSchema: schema({ note: { bsonType: 'string' } }) }
          })
          return create(name, options)
        }
      )

      await expect(sync()).rejects.toThrow(
        'things: its validator differs from its schema, bump DATA_GENERATION'
      )
    })

    test('two instances syncing at once both succeed', async () => {
      await expect(Promise.all([sync(), sync()])).resolves.toBeDefined()

      expect(await storedIndexes()).toHaveLength(1)
    })
  })

  describe('for an existing collection', () => {
    beforeEach(async () => {
      await sync()
      vi.spyOn(db, 'command')
    })

    test('changes nothing when its validator equals the schema', async () => {
      await sync()

      expect(db.command).not.toHaveBeenCalled()
    })

    test('accepts a schema whose titles and descriptions differ, leaving the validator as it was', async () => {
      const head = {
        ...schema({ name: { bsonType: 'string', description: 'A name.' } }),
        title: 'Thing',
        description: 'A thing.'
      }

      await sync({ schema: head })

      expect((await storedOptions()).validator).toEqual({
        $jsonSchema: schema()
      })
    })

    test('still compares a field named description', async () => {
      const withDescription = schema({ description: { bsonType: 'string' } })
      await db.dropDatabase()
      await sync({ schema: withDescription })

      await expect(sync()).rejects.toBeInstanceOf(DataSchemaMismatchError)
    })

    test.for([
      ['a new optional field', schema({ note: { bsonType: 'string' } })],
      [
        'a removed field',
        {
          ...schema(),
          required: ['_id'],
          properties: { _id: { bsonType: 'string' } }
        }
      ],
      ['a changed type', schema({ name: { bsonType: 'int' } })],
      [
        'a new required field',
        schema({ note: { bsonType: 'string' } }, ['note'])
      ],
      ['a new enum', schema({ name: { bsonType: 'string', enum: ['A'] } })]
    ])('refuses %s, leaving the validator as it was', async ([, head]) => {
      await expect(sync({ schema: head })).rejects.toThrow(
        'things: its validator differs from its schema, bump DATA_GENERATION'
      )
      expect((await storedOptions()).validator).toEqual({
        $jsonSchema: schema()
      })
    })

    test('refuses a rollback: the stored validator has a field the schema lacks', async () => {
      await db.dropDatabase()
      await sync({ schema: schema({ note: { bsonType: 'string' } }) })

      await expect(sync()).rejects.toBeInstanceOf(DataSchemaMismatchError)
    })

    test('refuses a validator that no longer rejects bad writes', async () => {
      await db.command({ collMod: collectionName, validationAction: 'warn' })

      await expect(sync()).rejects.toBeInstanceOf(DataSchemaMismatchError)
    })
  })

  test('refuses a collection with no validator', async () => {
    await db.createCollection(collectionName)

    await expect(sync()).rejects.toThrow(
      'things: has no validator to compare its schema with, bump DATA_GENERATION'
    )
  })

  describe('indexes are fixed for a generation', () => {
    beforeEach(() => sync())

    test.for([
      ['removed', []],
      ['made unique', [{ ...byName, unique: true }]],
      ['given another key', [{ ...byName, key: { name: -1 } }]]
    ])('refuses an index %s', async ([, indexes]) => {
      await expect(sync({ indexes })).rejects.toThrow(
        'things: its indexes differ from those declared: name_1, bump DATA_GENERATION'
      )
    })

    test('refuses a compound index with its keys reordered', async () => {
      const compound = { name: 'pair', key: { _id: 1, name: 1 } }
      await db.dropDatabase()
      await sync({ indexes: [compound] })

      await expect(
        sync({ indexes: [{ ...compound, key: { name: 1, _id: 1 } }] })
      ).rejects.toThrow('its indexes differ from those declared: pair')
    })

    test('refuses a new index once the collection holds documents', async () => {
      await db.collection(collectionName).insertOne({ _id: 'a', name: 'ok' })

      await expect(
        sync({
          indexes: [byName, { name: '_id_name', key: { _id: 1, name: 1 } }]
        })
      ).rejects.toThrow("it's missing declared indexes: _id_name")
    })

    test('creates a missing index while the collection is empty, e.g. another instance not done with it', async () => {
      await db.collection(collectionName).dropIndex('name_1')

      await sync()

      expect(await storedIndexes()).toHaveLength(1)
    })
  })

  test('syncs every collection given', async () => {
    const dataSchema = { schema: schema(), indexes: [] }

    await syncDataSchemas(
      db,
      [
        { collectionName: 'first', dataSchema },
        { collectionName: 'second', dataSchema }
      ],
      logger
    )

    const names = (await db.listCollections().toArray()).map(({ name }) => name)
    expect(names.sort()).toEqual(['first', 'second'])
  })

  test('is a DataSchemaMismatchError', async () => {
    await db.createCollection(collectionName)

    await expect(sync()).rejects.toBeInstanceOf(DataSchemaMismatchError)
  })
})
