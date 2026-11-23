// The DB schemas' conventions (see README.md beside this file) and their
// examples.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { MongoClient } from 'mongodb'
import { entityNames, loadDataExamples } from '#/common/data/data-schemas.js'
import { syncDataSchemas } from '#/common/data/sync-data-schemas.js'
import { bundle } from '#/common/openapi/bundle.js'
import { collectFiles } from '#/common/validation/schema-registry.js'
import { validateOpenApi } from '#test/helpers/openapi/validate-openapi.js'
import { dataSchemas, version } from '../../index.js'

const schemaRoot = import.meta.dirname

// MongoDB's $jsonSchema supports these, and they're all a stored shape
// needs: no conditional rules, formats or patterns. No `$ref`: a schema is
// its collection's validator as is, and MongoDB can't follow one.
const ALLOWED_KEYWORDS = new Set([
  'title',
  'description',
  'bsonType',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum'
])

// Stored as the request sent them, for now: see README.md
const OPEN_OBJECTS = new Set(['/properties/wasteItems/items'])

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
    expect(entityNames(schemaRoot)).toEqual(['delivery', 'movement'])
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

      test('closes every object, so nothing undocumented is stored', () => {
        const open = schemaNodes
          .filter(({ node }) => node.bsonType === 'object')
          .filter(({ node }) => node.additionalProperties !== false)
          .map(({ at }) => at || '/')
          .filter((at) => !OPEN_OBJECTS.has(at))
        expect(open).toEqual([])
      })

      test('describes every field', () => {
        const undescribed = schemaNodes
          .filter(({ node }) => !node.description)
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

  describe.each(Object.keys(dataSchemas))('%s indexes', (name) => {
    test('are each named, with a key and maybe unique', () => {
      for (const index of dataSchemas[name].indexes) {
        expect(Object.keys(index).sort()).toEqual(
          expect.arrayContaining(['key', 'name'])
        )
        expect(
          Object.keys(index).every((key) =>
            ['key', 'name', 'unique'].includes(key)
          )
        ).toBe(true)
      }
    })
  })

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

  test('gathers every entity', () => {
    expect(refs(spec.components.schemas)).toEqual(
      entityNames(schemaRoot)
        .map((name) => `./${name}/${name}.schema.json`)
        .sort()
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
