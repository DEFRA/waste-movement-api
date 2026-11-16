import { validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor('receipt/delivery-id-params.schema.json')

describe('delivery-id-params schema', () => {
  test('accepts a deliveryId', () => {
    expect(validateAjv({ deliveryId: '25KMT4Z9' }).valid).toBe(true)
  })

  test('deliveryId is required', () => {
    expect(validateAjv({}).valid).toBe(false)
  })

  // deliveryId's own rules are covered by delivery-id.test.js — this confirms
  // the $ref wiring is live.
  test('rejects a deliveryId not in the ID format', () => {
    expect(validateAjv({ deliveryId: 'NONEXISTENT' }).valid).toBe(false)
  })

  test('rejects an additional param beyond the declared ones', () => {
    expect(
      validateAjv({ deliveryId: '25KMT4Z9', extra: 'not allowed' }).valid
    ).toBe(false)
  })
})
