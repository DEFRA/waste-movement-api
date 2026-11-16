import { validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor('common/validation.schema.json')

const warning = {
  pointer: '/wasteItems/0/physicalDetails/totalWeight',
  errorType: 'BusinessRuleViolation',
  message: 'Weight is unusually high'
}

describe('Feature: Schema - data-quality feedback in a response', () => {
  describe('Scenario: There are no warnings', () => {
    test('validation passes with an empty warnings list', () => {
      expect(validateAjv({ warnings: [] }).valid).toBe(true)
    })
  })

  describe('Scenario: There are warnings', () => {
    test('validation passes when every warning is an issue', () => {
      expect(validateAjv({ warnings: [warning] }).valid).toBe(true)
    })

    test('validation fails when a warning is not an issue', () => {
      expect(
        validateAjv({ warnings: ['Weight is unusually high'] }).valid
      ).toBe(false)
    })
  })

  describe('Scenario: The warnings list is left out', () => {
    test('validation fails, since an empty list is sent instead', () => {
      expect(validateAjv({}).valid).toBe(false)
    })
  })

  describe('Scenario: The feedback carries an unknown field', () => {
    test('validation fails', () => {
      expect(validateAjv({ warnings: [], errors: [] }).valid).toBe(false)
    })
  })
})
