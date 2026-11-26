import path from 'node:path'
import { Binary, ObjectId } from 'mongodb'
import { entityNames, loadDataSchemas } from './data-schemas.js'

const fixtures = path.join(import.meta.dirname, 'test-fixtures')

describe('loadDataSchemas', () => {
  const { widget } = loadDataSchemas(fixtures)

  const document = {
    _id: new ObjectId(),
    count: 3,
    createdAt: new Date(),
    payload: new Binary(Buffer.from('{}')),
    isOpen: true,
    tags: ['a'],
    owner: { name: 'Ann' }
  }

  test('finds every entity folder with a schema and indexes', () => {
    expect(entityNames(fixtures)).toEqual(['widget'])
  })

  test("resolves the schema's $refs", () => {
    expect(widget.schema.properties.owner).toEqual({
      bsonType: 'object',
      description: 'Who owns it.',
      additionalProperties: false,
      properties: { name: { bsonType: 'string', description: 'A name.' } }
    })
  })

  test('reads the indexes', () => {
    expect(widget.indexes).toEqual([{ name: 'count_1', key: { count: 1 } }])
  })

  test('accepts a document of the right shape', () => {
    expect(widget.validate(document)).toBe(true)
  })

  test.for([
    ['_id', 'objectId', 'not an ObjectId'],
    ['count', 'int', 1.5],
    ['count', 'int', 2 ** 31],
    ['createdAt', 'date', '2026-01-01T00:00:00Z'],
    ['payload', 'binData', '{}'],
    ['isOpen', 'bool', 'true'],
    ['tags', 'array', 'a'],
    ['owner', 'object', new Date()],
    ['owner', 'object', ['Ann']]
  ])('rejects %s as not a %s: %j', ([field, _type, value]) => {
    expect(widget.validate({ ...document, [field]: value })).toBe(false)
    expect(widget.validate.errors).toContainEqual(
      expect.objectContaining({
        instancePath: `/${field}`,
        keyword: 'bsonType'
      })
    )
  })

  test('accepts any of a list of bsonTypes', () => {
    expect(widget.validate({ ...document, note: null })).toBe(true)
    expect(widget.validate({ ...document, note: 'text' })).toBe(true)
    expect(widget.validate({ ...document, note: 1 })).toBe(false)
  })

  test('rejects a missing required field or one not in the schema', () => {
    const { count, ...withoutCount } = document

    expect(widget.validate(withoutCount)).toBe(false)
    expect(widget.validate({ ...document, extra: 1 })).toBe(false)
  })
})
