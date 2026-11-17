// The DB schemas' conventions (see README.md beside this file), their
// examples, and the mappers that turn every API example into a stored
// document and back into a response.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { MongoClient } from 'mongodb'
import { collectFiles } from '#/common/validation/schema-registry.js'
import { entityStore } from '#/common/data/entity-store.js'
import {
  BSON_TYPES,
  entityNames,
  loadDataExamples
} from '#/common/data/data-schemas.js'
import { fromPayload } from '#/common/data/payload.js'
import { bundle } from '#/common/openapi/bundle.js'
import { validateOpenApi } from '#test/helpers/openapi/validate-openapi.js'
import { syncCollection } from '#/common/data/sync-collection.js'
import { validators } from '../../schemas/validators.js'
import { dataSchemas } from '../../index.js'
import * as collection from '../mappers/collection.js'
import * as delivery from '../mappers/delivery.js'
import * as movement from '../mappers/movement.js'
import * as receipt from '../mappers/receipt.js'

const schemaRoot = import.meta.dirname
const apiSchemaRoot = path.join(schemaRoot, '..', '..', 'schemas')

// MongoDB's $jsonSchema supports these, and they're all a stored shape
// needs: no conditional rules, formats or patterns.
const ALLOWED_KEYWORDS = new Set([
  'title',
  'description',
  'bsonType',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  '$ref'
])

const relative = (file) => path.relative(schemaRoot, file)

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

      test('types every field with a bsonType MongoDB and ajv both know', () => {
        const untyped = schemaNodes
          .filter(({ node }) => !node.$ref)
          .filter(
            ({ node }) =>
              ![node.bsonType].flat().every((type) => BSON_TYPES.includes(type))
          )
          .map(({ at }) => at || '/')
        expect(untyped).toEqual([])
      })

      test('closes every object', () => {
        const open = schemaNodes
          .filter(({ node }) => node.bsonType === 'object')
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

  describe('examples', () => {
    let client
    let db

    beforeAll(async () => {
      client = await MongoClient.connect(process.env.MONGO_URI)
      db = client.db('beta-3-data-schemas-test')
      await db.dropDatabase()
    })

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
        await syncCollection(db, name, dataSchemas[name], console)

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

describe('mappers', () => {
  const apiExamples = (name) =>
    Object.entries(
      JSON.parse(
        readFileSync(path.join(apiSchemaRoot, `${name}.examples.json`), 'utf-8')
      )
    )

  // Stamps the envelope and checks the result against the DB schema, as the
  // store does before a write
  const stored = (entity, fields, _id) => {
    const { newDocument } = entityStore('test', dataSchemas[entity], console)
    const document = newDocument(
      { _id, orgId: 'org', traceId: 'trace' },
      fields
    )
    const { validate } = dataSchemas[entity]
    expect(validate(document), JSON.stringify(validate.errors)).toBe(true)
    return document
  }

  const expectResponseValid = (route, body) => {
    const id = `${route}.schema.json`
    expect(
      validators.validate(id, body),
      JSON.stringify(validators.getErrors(id))
    ).toBe(true)
  }

  describe.each(apiExamples('creation/create-movement-request'))(
    'movement: %s',
    (_, { value }) => {
      test('API → DB → API', () => {
        const document = stored(
          'movement',
          movement.toDocument(value),
          '26HRA0B2'
        )

        expect(fromPayload(document.payload)).toEqual(value)
        expectResponseValid(
          'creation/create-movement-response',
          movement.toResponse(document)
        )
      })
    }
  )

  describe.each(apiExamples('collection/record-collection-request'))(
    'collection: %s',
    (_, { value }) => {
      test('API → DB → API', () => {
        const document = stored(
          'collection',
          collection.toDocument(value, '26HRA0B2')
        )

        expect(fromPayload(document.payload)).toEqual(value)
        expectResponseValid(
          'collection/record-collection-response',
          collection.toResponse(document)
        )
      })
    }
  )

  describe.each(apiExamples('delivery/record-delivery-request'))(
    'delivery: %s',
    (_, { value }) => {
      test('API → DB → API', () => {
        const [first, ...rest] = value.movementIds
        const documents = [
          {
            deliveryId: '26KMT4Z9',
            movementIds: [first],
            wasteType: 'NON_HAZARDOUS'
          },
          ...rest.map((movementId) => ({
            deliveryId: movementId,
            movementIds: [movementId],
            wasteType: 'HAZARDOUS'
          }))
        ].map((grouping) =>
          stored('delivery', delivery.toDocument(value, grouping))
        )

        documents.forEach((document) =>
          expect(fromPayload(document.payload)).toEqual(value)
        )
        expectResponseValid(
          'delivery/record-delivery-response',
          delivery.toResponse(documents)
        )
      })
    }
  )

  test("delivery: an undocumented receipt's", () => {
    const document = stored(
      'delivery',
      delivery.toUndocumentedDocument('26NDL0C3')
    )

    expect(document).not.toHaveProperty('payload')
  })

  describe.each([
    ...apiExamples('receipt/record-receipt-request').map(([name, example]) => [
      name,
      example,
      'receipt/record-receipt-response'
    ]),
    ...apiExamples('receipt/record-receipt-undocumented-request').map(
      ([name, example]) => [
        `undocumented ${name}`,
        example,
        'receipt/record-receipt-undocumented-response'
      ]
    )
  ])('receipt: %s', (_, { value }, responseSchema) => {
    test('API → DB → API', () => {
      const document = stored('receipt', receipt.toDocument(value, '26KMT4Z9'))

      expect(fromPayload(document.payload)).toEqual(value)
      expectResponseValid(responseSchema, receipt.toResponse(document))
    })
  })
})
