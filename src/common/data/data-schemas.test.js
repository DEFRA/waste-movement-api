import path from 'node:path'
import { entityNames, loadDataSchemas } from './data-schemas.js'

const fixtures = path.join(import.meta.dirname, 'test-fixtures')

describe('loadDataSchemas', () => {
  const { widget } = loadDataSchemas(fixtures)

  test('finds every entity folder with a schema and indexes', () => {
    expect(entityNames(fixtures)).toEqual(['widget'])
  })

  test('reads the schema', () => {
    expect(widget.schema).toMatchObject({
      title: 'Widget',
      bsonType: 'object',
      required: ['_id', 'name']
    })
  })

  test('reads the indexes', () => {
    expect(widget.indexes).toEqual([{ name: 'name_1', key: { name: 1 } }])
  })
})
