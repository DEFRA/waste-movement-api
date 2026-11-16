import path from 'node:path'
import { bundle } from './bundle.js'

const fixture = (name) => path.join(import.meta.dirname, 'test-fixtures', name)

describe('bundle', () => {
  const bundled = bundle(fixture('openapi.json'))
  const operation = bundled.paths['/things'].post

  test('replaces a $ref with the file it names', () => {
    expect(operation.requestBody.content['application/json'].examples).toEqual({
      minimal: { value: { name: 'a~b/c' } }
    })
  })

  test('resolves refs inside a referenced file against that file', () => {
    const { schema } = operation.requestBody.content['application/json']

    expect(schema.properties.address).toEqual({
      type: 'object',
      properties: { postcode: { type: 'string' } }
    })
    expect(schema.properties.parent).toEqual({ type: 'string' })
  })

  test('follows a JSON pointer and keeps keywords beside the $ref', () => {
    expect(
      operation.responses['201'].content['application/json'].schema
    ).toEqual({ type: 'string', description: 'Kept on top of the target' })
  })

  test('leaves no $ref behind', () => {
    expect(JSON.stringify(bundled)).not.toContain('$ref')
  })

  test('unescapes ~1 and ~0 in a pointer', () => {
    expect(bundle(fixture('escaped.json')).a).toEqual({ type: 'string' })
  })

  test('throws for a missing file', () => {
    expect(() => bundle(fixture('missing-file.json'))).toThrow(
      'Cannot resolve $ref "schemas/nope.schema.json" in missing-file.json'
    )
  })

  test('throws for a missing pointer', () => {
    expect(() => bundle(fixture('missing-pointer.json'))).toThrow(
      'Cannot resolve $ref "schemas/thing.schema.json#/properties/nope" in missing-pointer.json'
    )
  })

  test('throws for a circular ref', () => {
    expect(() => bundle(fixture('circular.json'))).toThrow(
      /^Circular \$ref "#\/[ab]" in circular.json$/
    )
  })
})
