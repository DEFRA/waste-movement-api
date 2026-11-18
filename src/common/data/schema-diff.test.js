import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  breakingChanges,
  compareDataSchemas,
  flattenSchema
} from './schema-diff.js'

const object = (properties, required = []) => ({
  bsonType: 'object',
  additionalProperties: false,
  required,
  properties
})
const string = { bsonType: 'string' }

const movement = (properties = {}, required = []) =>
  object({ _id: string, isHazardous: { bsonType: 'bool' }, ...properties }, [
    '_id',
    'isHazardous',
    ...required
  ])

const diff = (base, head) =>
  breakingChanges(flattenSchema(base), flattenSchema(head))

describe('flattenSchema', () => {
  test('lists every field by path, with its type and whether it is required', () => {
    const schema = object(
      {
        name: string,
        owner: object({ email: string }, ['email']),
        tags: { bsonType: 'array', items: string },
        note: { bsonType: ['string', 'null'] },
        status: { bsonType: 'string', enum: ['OPEN', 'SHUT'] }
      },
      ['name']
    )

    expect(Object.fromEntries(flattenSchema(schema))).toEqual({
      name: { type: 'string', required: true },
      owner: { type: 'object', required: false },
      'owner.email': { type: 'string', required: true },
      tags: { type: 'array', required: false },
      'tags[]': { type: 'string', required: true },
      note: { type: 'null|string', required: false },
      status: { type: 'string', required: false, enum: ['OPEN', 'SHUT'] }
    })
  })
})

describe('breakingChanges', () => {
  test('none when nothing changed', () => {
    expect(diff(movement(), movement())).toEqual([])
  })

  test('none for a new optional field, or an enum value added', () => {
    const base = movement({ status: { bsonType: 'string', enum: ['A'] } })
    const head = movement({
      status: { bsonType: 'string', enum: ['A', 'B'] },
      note: string
    })

    expect(diff(base, head)).toEqual([])
  })

  test('none for a required field that was optional, made optional', () => {
    expect(
      diff(movement({ note: string }, ['note']), movement({ note: string }))
    ).toEqual([])
  })

  test('none for a new optional object with required fields of its own', () => {
    const head = movement({ owner: object({ email: string }, ['email']) })

    expect(diff(movement(), head)).toEqual([])
  })

  test('a removed field, and a renamed one', () => {
    const base = movement({ wasteType: string })
    const head = object({ _id: string, wasteCategory: string }, [
      '_id',
      'wasteCategory'
    ])

    expect(diff(base, head)).toEqual([
      '- removed  isHazardous',
      '- removed  wasteType',
      '+ required wasteCategory'
    ])
  })

  test('a changed type', () => {
    expect(diff(movement(), movement({ isHazardous: string }))).toEqual([
      '~ type     isHazardous: bool → string'
    ])
  })

  test('a field made required', () => {
    expect(
      diff(movement({ note: string }), movement({ note: string }, ['note']))
    ).toEqual(['+ required note'])
  })

  test('a new required field inside an existing object', () => {
    const base = movement({ owner: object({ name: string }) })
    const head = movement({
      owner: object({ name: string, email: string }, ['email'])
    })

    expect(diff(base, head)).toEqual(['+ required owner.email'])
  })

  test('an enum value removed, or an enum added', () => {
    const base = movement({
      status: { bsonType: 'string', enum: ['A', 'B'] },
      kind: string
    })
    const head = movement({
      status: { bsonType: 'string', enum: ['A'] },
      kind: { bsonType: 'string', enum: ['X'] }
    })

    expect(diff(base, head)).toEqual([
      '~ enum     status: no longer B',
      '~ enum     kind: restricted'
    ])
  })

  test("a changed array's item type", () => {
    const tags = (bsonType) => ({
      tags: { bsonType: 'array', items: { bsonType } }
    })

    expect(diff(movement(tags('string')), movement(tags('int')))).toEqual([
      '~ type     tags[]: string → int'
    ])
  })
})

describe('compareDataSchemas', () => {
  let root

  // A copy of src/versions with one version's movement schema and generation
  const versions = (name, { schema = movement(), generation = 1 } = {}) => {
    const entityDir = path.join(
      root,
      name,
      'beta-3',
      'data',
      'schemas',
      'movement'
    )
    mkdirSync(entityDir, { recursive: true })
    writeFileSync(
      path.join(entityDir, 'movement.schema.json'),
      JSON.stringify(schema)
    )
    writeFileSync(path.join(entityDir, 'movement.indexes.json'), '[]')
    writeFileSync(
      path.join(root, name, 'beta-3', 'data', 'generation.js'),
      `export const DATA_GENERATION = ${generation}\n`
    )
    return path.join(root, name)
  }

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'schema-diff-test-'))
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  test('reports nothing when the schemas are compatible', async () => {
    expect(
      await compareDataSchemas(
        versions('base'),
        versions('head', { schema: movement({ note: string }) })
      )
    ).toEqual([])
  })

  test('reports a breaking change made without a bump', async () => {
    expect(
      await compareDataSchemas(
        versions('base', { schema: movement({ note: string }) }),
        versions('head')
      )
    ).toEqual([
      {
        apiVersion: 'beta-3',
        entity: 'movement',
        changes: ['- removed  note'],
        isGenerationBumped: false
      }
    ])
  })

  test('reports a breaking change made with a bump as bumped', async () => {
    const [result] = await compareDataSchemas(
      versions('base', { schema: movement({ note: string }) }),
      versions('head', { generation: 2 })
    )

    expect(result.isGenerationBumped).toBe(true)
  })

  test('reports an entity removed', async () => {
    const base = versions('base')
    const head = path.join(root, 'head')
    mkdirSync(path.join(head, 'beta-3', 'data', 'schemas'), { recursive: true })

    expect(await compareDataSchemas(base, head)).toEqual([
      expect.objectContaining({
        entity: 'movement',
        changes: ['- removed  (the whole entity)'],
        isGenerationBumped: false
      })
    ])
  })

  test('skips a version with no DB schemas in the base, e.g. a new one', async () => {
    const base = path.join(root, 'base')
    mkdirSync(path.join(base, 'beta-3'), { recursive: true })

    expect(await compareDataSchemas(base, versions('head'))).toEqual([])
  })
})
