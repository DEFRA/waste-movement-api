import { validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor(
  'creation/create-movement-response.schema.json'
)

describe('Feature: Create movement response', () => {
  const body = {
    data: { movementId: '25HRA0B2' },
    validation: { warnings: [] }
  }

  test('a response with a movementId and no warnings is accepted', () => {
    expect(validateAjv(body).valid).toBe(true)
  })

  test('a response is rejected when data is missing', () => {
    expect(validateAjv({ validation: { warnings: [] } }).valid).toBe(false)
  })

  test('a response is rejected when movementId is missing', () => {
    expect(validateAjv({ ...body, data: {} }).valid).toBe(false)
  })

  test('a response is rejected when movementId is not a string', () => {
    expect(validateAjv({ ...body, data: { movementId: 123 } }).valid).toBe(
      false
    )
  })

  test('a response is rejected when it has an extra property', () => {
    expect(validateAjv({ ...body, extra: true }).valid).toBe(false)
  })

  test('a response is rejected when data has an extra property', () => {
    expect(
      validateAjv({ ...body, data: { ...body.data, extra: 1 } }).valid
    ).toBe(false)
  })
})
