import path from 'node:path'
import { Binary, MongoClient, ObjectId } from 'mongodb'
import { loadDataSchemas } from './data-schemas.js'
import { DocumentValidationError, entityStore } from './entity-store.js'

const { widget } = loadDataSchemas(
  path.join(import.meta.dirname, 'test-fixtures')
)

const logger = { error: vi.fn() }

// A widget's fields, besides its _id
const fields = {
  count: 3,
  createdAt: new Date(),
  payload: new Binary(Buffer.from('{}')),
  isOpen: true,
  tags: ['a'],
  owner: { name: 'Ann' }
}

describe('entityStore', () => {
  const store = entityStore('entity-store-test', widget, logger)

  describe('newDocument', () => {
    beforeAll(() => vi.useFakeTimers({ toFake: ['Date'] }))
    afterAll(() => vi.useRealTimers())

    test('stamps the envelope: a new _id, revision 0 and the same createdAt and updatedAt', () => {
      const now = new Date()

      expect(
        store.newDocument({ orgId: 'org', requestId: 'request' }, { a: 1 })
      ).toEqual({
        _id: expect.any(ObjectId),
        orgId: 'org',
        requestId: 'request',
        revision: 0,
        createdAt: now,
        updatedAt: now,
        a: 1
      })
    })

    test('gives every document its own _id', () => {
      const envelope = { orgId: 'org', requestId: 'request' }

      expect(store.newDocument(envelope, {})._id).not.toEqual(
        store.newDocument(envelope, {})._id
      )
    })
  })

  describe('writes', () => {
    // Connects on its first operation
    const client = new MongoClient(process.env.MONGO_URI)
    const db = client.db('entity-store-test')

    beforeAll(() => db.dropDatabase())

    afterAll(async () => {
      await db.dropDatabase()
      await client.close()
    })

    beforeEach(() => db.collection('entity-store-test').deleteMany({}))

    const widgetDocument = () => ({ _id: new ObjectId(), ...fields })

    test('inserts a document that matches the schema', async () => {
      const document = widgetDocument()

      await store.insertOne(db, document)

      expect(
        await db.collection('entity-store-test').findOne({ _id: document._id })
      ).toEqual(document)
    })

    test('rejects one that does not before writing anything, saying where', async () => {
      const error = await store
        .insertMany(db, [widgetDocument(), { ...widgetDocument(), count: 'x' }])
        .catch((e) => e)

      expect(error).toBeInstanceOf(DocumentValidationError)
      expect(error.errors).toContainEqual(
        expect.objectContaining({ instancePath: '/count', keyword: 'bsonType' })
      )
      expect(logger.error).toHaveBeenCalledWith(
        { collection: 'entity-store-test', errors: error.errors },
        error.message
      )
      expect(await db.collection('entity-store-test').countDocuments()).toBe(0)
    })
  })
})
