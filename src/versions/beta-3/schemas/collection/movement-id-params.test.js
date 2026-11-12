import { validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor('collection/movement-id-params.schema.json')

describe('movement-id-params schema', () => {
  test('accepts a movementId', () => {
    expect(validateAjv({ movementId: '25HRA0B2' }).valid).toBe(true)
  })

  test('movementId is required', () => {
    expect(validateAjv({}).valid).toBe(false)
  })

  // movementId's own rules are covered by movement-id.test.js — this confirms
  // the $ref wiring is live.
  test('rejects a movementId not in the ID format', () => {
    expect(validateAjv({ movementId: 'NONEXISTENT' }).valid).toBe(false)
  })

  test('rejects an additional param beyond the declared ones', () => {
    expect(
      validateAjv({ movementId: '25HRA0B2', extra: 'not allowed' }).valid
    ).toBe(false)
  })
})
