// The DB schemas' conventions (see README.md beside this file), their
// examples, and every API request example stored through its data module.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { MongoClient } from 'mongodb'
import {
  BSON_TYPES,
  entityNames,
  loadDataExamples
} from '#/common/data/data-schemas.js'
import { fromPayload } from '#/common/data/payload.js'
import { syncDataSchemas } from '#/common/data/sync-data-schemas.js'
import { bundle } from '#/common/openapi/bundle.js'
import { collectFiles } from '#/common/validation/schema-registry.js'
import { validateOpenApi } from '#test/helpers/openapi/validate-openapi.js'
import { dataSchemas, version } from '../../index.js'

const schemaRoot = import.meta.dirname
const apiSchemaRoot = path.join(schemaRoot, '..', '..', 'schemas')

// MongoDB's $jsonSchema supports these, and they're all a stored shape
// needs: no conditional rules, formats or patterns. A `$ref` is resolved
// when the schema is loaded, as MongoDB can't follow one.
const ALLOWED_KEYWORDS = new Set([
  'title',
  'description',
  'type',
  'bsonType',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  '$ref'
])

// The JSON types MongoDB's `type` supports (not `integer`). They go in
// `type`, which JSON Schema and OpenAPI tools understand; `bsonType` is only
// for what `type` can't say, e.g. `objectId` or `date`. MongoDB rejects a
// node with both.
const JSON_TYPES = ['string', 'boolean', 'number', 'object', 'array', 'null']
const BSON_ONLY_TYPES = BSON_TYPES.filter(
  (type) => !['string', 'bool', 'object', 'array', 'null'].includes(type)
)

const envelope = JSON.parse(
  readFileSync(path.join(schemaRoot, 'common', 'envelope.schema.json'), 'utf-8')
)
const envelopeFields = Object.keys(envelope.properties)

const relative = (file) => path.relative(schemaRoot, file)
const readSchema = (name) =>
  JSON.parse(
    readFileSync(path.join(schemaRoot, name, `${name}.schema.json`), 'utf-8')
  )

// Every schema node in a schema file, with where it is
const nodes = (node, at = '') => [
  { node, at },
  ...Object.entries(node.properties ?? {}).flatMap(([name, child]) =>
    nodes(child, `${at}/properties/${name}`)
  ),
  ...(node.items ? nodes(node.items, `${at}/items`) : [])
]

describe('DB schemas', () => {
  const files = collectFiles(schemaRoot, '.schema.json')

  test('one per entity, as its collection is named', () => {
    expect(entityNames(schemaRoot)).toEqual([
      'collection',
      'delivery',
      'movement',
      'receipt'
    ])
  })

  describe.each(files.map((file) => [relative(file), file]))(
    '%s',
    (_, file) => {
      const schemaNodes = nodes(JSON.parse(readFileSync(file, 'utf-8')))

      test('uses only the keywords MongoDB supports and a shape needs', () => {
        const unsupported = schemaNodes.flatMap(({ node, at }) =>
          Object.keys(node)
            .filter((keyword) => !ALLOWED_KEYWORDS.has(keyword))
            .map((keyword) => `${at}/${keyword}`)
        )
        expect(unsupported).toEqual([])
      })

      test('types every field: a JSON type as `type`, a BSON-only one as `bsonType`', () => {
        const isTyped = ({ type, bsonType }) =>
          type === undefined
            ? BSON_ONLY_TYPES.includes(bsonType)
            : bsonType === undefined && JSON_TYPES.includes(type)
        const untyped = schemaNodes
          .filter(({ node }) => !node.$ref && !isTyped(node))
          .map(({ at }) => at || '/')
        expect(untyped).toEqual([])
      })

      test('closes every object, so nothing undocumented is stored', () => {
        const open = schemaNodes
          .filter(({ node }) => node.type === 'object')
          .filter(({ node }) => node.additionalProperties !== false)
          .map(({ at }) => at || '/')
        expect(open).toEqual([])
      })

      test('describes every field', () => {
        const undescribed = schemaNodes
          .filter(({ node }) => !node.$ref && !node.description)
          .map(({ at }) => at || '/')
        expect(undescribed).toEqual([])
      })

      test('requires only fields it defines', () => {
        const unknown = schemaNodes.flatMap(({ node, at }) =>
          (node.required ?? [])
            .filter((name) => !(name in (node.properties ?? {})))
            .map((name) => `${at}/required/${name}`)
        )
        expect(unknown).toEqual([])
      })
    }
  )

  describe.each(entityNames(schemaRoot))('%s', (name) => {
    const { properties } = readSchema(name)

    test("refers to every one of the envelope's fields", () => {
      expect(envelopeFields.map((field) => properties[field]?.$ref)).toEqual(
        envelopeFields.map(
          (field) => `../common/envelope.schema.json#/properties/${field}`
        )
      )
    })
  })

  describe.each(Object.keys(dataSchemas))('%s indexes', (name) => {
    test('are each named as MongoDB names them, with a key and maybe unique', () => {
      for (const index of dataSchemas[name].indexes) {
        expect(
          Object.keys(index).every((key) =>
            ['key', 'name', 'unique'].includes(key)
          )
        ).toBe(true)
        expect(index.name).toBe(
          Object.entries(index.key)
            .map(([field, order]) => `${field}_${order}`)
            .join('_')
        )
      }
    })
  })

  describe('examples', () => {
    // Connects on its first operation
    const client = new MongoClient(process.env.MONGO_URI)
    const db = client.db('beta-3-data-schemas-test')

    beforeAll(() => db.dropDatabase())

    afterAll(async () => {
      await db.dropDatabase()
      await client.close()
    })

    describe.each(Object.keys(dataSchemas))('%s', (name) => {
      const examples = Object.entries(loadDataExamples(schemaRoot, name))

      test('has at least one', () => {
        expect(examples.length).toBeGreaterThan(0)
      })

      test.each(examples)('%s matches the schema', (_, { value }) => {
        const { validate } = dataSchemas[name]
        expect(validate(value), JSON.stringify(validate.errors)).toBe(true)
      })

      test('MongoDB stores every one under the schema as its validator', async () => {
        await syncDataSchemas(
          db,
          [{ collectionName: name, dataSchema: dataSchemas[name] }],
          version.logger
        )

        await expect(
          db.collection(name).insertMany(examples.map(([, { value }]) => value))
        ).resolves.toMatchObject({ insertedCount: examples.length })
      })
    })
  })
})

describe('openapi.json', () => {
  const specPath = path.join(schemaRoot, 'openapi.json')
  const spec = JSON.parse(readFileSync(specPath, 'utf-8'))
  const refs = (components) =>
    Object.values(components)
      .map(({ $ref }) => $ref)
      .sort()

  test('is a valid OpenAPI 3.1 document with all its $refs resolved', () => {
    expect(validateOpenApi(bundle(specPath))).toBeNull()
  })

  test('gathers every entity and the envelope', () => {
    expect(refs(spec.components.schemas)).toEqual(
      [
        './common/envelope.schema.json',
        ...entityNames(schemaRoot).map(
          (name) => `./${name}/${name}.schema.json`
        )
      ].sort()
    )
  })

  test('gathers every example', () => {
    expect(refs(spec.components.examples)).toEqual(
      entityNames(schemaRoot)
        .flatMap((name) =>
          Object.keys(loadDataExamples(schemaRoot, name)).map(
            (example) => `./${name}/${name}.examples.json#/${example}`
          )
        )
        .sort()
    )
  })
})

describe('every API request example, stored through its data module', () => {
  const client = new MongoClient(process.env.MONGO_URI)
  const db = client.db('beta-3-data-round-trip-test')
  const { movements, collections, deliveries, receipts } = version
  const envelope = { orgId: 'org', requestId: 'request' }

  const apiExamples = (name) =>
    Object.entries(
      JSON.parse(
        readFileSync(path.join(apiSchemaRoot, `${name}.examples.json`), 'utf-8')
      )
    )

  // Each example is stored under its own ID, as the unique indexes need
  const findStored = (data, filter) =>
    db.collection(data.collectionName).findOne(filter)

  beforeAll(async () => {
    await db.dropDatabase()
    await syncDataSchemas(
      db,
      [movements, collections, deliveries, receipts],
      version.logger
    )
  })

  afterAll(async () => {
    await db.dropDatabase()
    await client.close()
  })

  describe.each(apiExamples('creation/create-movement-request'))(
    'movement: %s',
    (name, { value }) => {
      test('is stored as sent', async () => {
        const movementId = `movement-${name}`

        await movements.createMovementRecord(db, {
          ...envelope,
          movementId,
          payload: value
        })

        const stored = await findStored(movements, { movementId })
        expect(fromPayload(stored.payload)).toEqual(value)
      })
    }
  )

  describe.each(apiExamples('collection/record-collection-request'))(
    'collection: %s',
    (name, { value }) => {
      test('is stored as sent', async () => {
        const movementId = `collection-${name}`

        await collections.createCollectionRecord(db, {
          ...envelope,
          movementId,
          payload: value
        })

        const stored = await findStored(collections, { movementId })
        expect(fromPayload(stored.payload)).toEqual(value)
      })
    }
  )

  describe.each(apiExamples('delivery/record-delivery-request'))(
    'delivery: %s',
    (name, { value }) => {
      test('is stored as sent by every Delivery it records', async () => {
        const requestId = `delivery-${name}`
        const [first, ...rest] = value.movementIds

        await deliveries.createDeliveryRecords(
          db,
          client,
          { ...envelope, requestId, payload: value },
          [
            {
              deliveryId: requestId,
              movementIds: [first],
              wasteType: 'NON_HAZARDOUS'
            },
            ...rest.map((movementId) => ({
              deliveryId: movementId,
              movementIds: [movementId],
              wasteType: 'HAZARDOUS'
            }))
          ]
        )

        const stored = await db
          .collection(deliveries.collectionName)
          .find({ requestId })
          .toArray()
        expect(stored).toHaveLength(value.movementIds.length)
        stored.forEach((document) =>
          expect(fromPayload(document.payload)).toEqual(value)
        )
      })
    }
  )

  describe.each([
    ...apiExamples('receipt/record-receipt-request'),
    ...apiExamples('receipt/record-receipt-undocumented-request').map(
      ([name, example]) => [`undocumented ${name}`, example]
    )
  ])('receipt: %s', (name, { value }) => {
    test('is stored as sent', async () => {
      const deliveryId = `receipt-${name}`

      await receipts.createReceiptRecord(db, {
        ...envelope,
        deliveryId,
        payload: value
      })

      const stored = await findStored(receipts, { deliveryId })
      expect(fromPayload(stored.payload)).toEqual(value)
    })
  })
})
