import { validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor('common/waste-type.schema.json')

describe('Feature: Schema - the waste type of a delivery', () => {
  describe('Scenario: A known waste type is accepted', () => {
    test.each(['HAZARDOUS', 'NON_HAZARDOUS'])('accepts %s', (wasteType) => {
      expect(validateAjv(wasteType).valid).toBe(true)
    })
  })

  describe('Scenario: Anything else is rejected', () => {
    test.each([
      ['a display label', 'Non-hazardous'],
      ['a lower-case value', 'hazardous'],
      ['an empty string', ''],
      ['a boolean', true]
    ])('rejects %s', (_label, wasteType) => {
      expect(validateAjv(wasteType).valid).toBe(false)
    })
  })
})
