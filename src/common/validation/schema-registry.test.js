import path from 'node:path'
import { createSchemaRegistry } from './schema-registry.js'

const fixtureRoot = path.join(import.meta.dirname, 'test-fixtures')
const { ajv, validate, getErrors } = createSchemaRegistry(fixtureRoot)

const addressId = 'common/address.schema.json'

describe('schema registry', () => {
  test('loads schemas keyed by their path relative to the schema root', () => {
    expect(ajv.getSchema(addressId)).toBeDefined()
  })

  test('resolves relative $refs against the registering path', () => {
    // shipment-request.schema.json $refs common/address.schema.json. ajv
    // compiles lazily, so this getSchema call is what resolves it, and it
    // throws unless the path key became the schema's base URI.
    expect(() => ajv.getSchema('shipment-request.schema.json')).not.toThrow()
  })

  test('validates a payload against a registered schema', () => {
    expect(validate(addressId, { postcode: 'TE1 2PQ' })).toBe(true)
    expect(getErrors(addressId)).toBe(null)
  })

  test('exposes errors after a failed validation', () => {
    expect(validate(addressId, {})).toBe(false)
    expect(getErrors(addressId)).not.toBeNull()
  })

  test('throws for an unregistered path', () => {
    expect(() => validate('does/not/exist.schema.json', {})).toThrow(
      'No schema registered under "does/not/exist.schema.json".'
    )
  })

  test('keeps each root separate', () => {
    const other = createSchemaRegistry(path.join(fixtureRoot, 'common'))

    expect(other.ajv.getSchema('address.schema.json')).toBeDefined()
    expect(ajv.getSchema('address.schema.json')).toBeUndefined()
  })
})
