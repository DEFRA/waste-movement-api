import { validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor('receipt/record-receipt-response.schema.json')

describe('Feature: Record receipt response', () => {
  const body = {
    data: { deliveryId: '25KMT4Z9' },
    validation: { warnings: [] }
  }

  test('a response with a deliveryId and no warnings is accepted', () => {
    expect(validateAjv(body).valid).toBe(true)
  })

  test('a response is rejected when data is missing', () => {
    expect(validateAjv({ validation: { warnings: [] } }).valid).toBe(false)
  })

  test('a response is rejected when deliveryId is missing', () => {
    expect(validateAjv({ ...body, data: {} }).valid).toBe(false)
  })

  test('a response is rejected when deliveryId is not a string', () => {
    expect(validateAjv({ ...body, data: { deliveryId: 42 } }).valid).toBe(false)
  })

  test('a response is rejected when it has an extra property', () => {
    expect(validateAjv({ ...body, extra: true }).valid).toBe(false)
  })
})
