import { validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor('common/issue.schema.json')

const issue = {
  pointer: '/producer',
  errorType: 'NotProvided',
  message: "'producer' is required"
}

describe('Feature: Schema - an issue reported on a submitted field', () => {
  describe('Scenario: An issue names the field, the error type and a message', () => {
    test('validation passes with a pointer, error type and message', () => {
      expect(validateAjv(issue).valid).toBe(true)
    })
  })

  describe('Scenario: An issue is missing one of its parts', () => {
    test.each(['pointer', 'errorType', 'message'])(
      'validation fails without %s',
      (field) => {
        const { [field]: excluded, ...payload } = issue
        expect(validateAjv(payload).valid).toBe(false)
      }
    )
  })

  // errorType keeps waste-movement-utils' categories, which the legacy routes
  // also return, rather than SCREAMING_SNAKE.
  describe('Scenario: The error type is one of the validation error categories', () => {
    test('validation passes with BusinessRuleViolation', () => {
      expect(
        validateAjv({ ...issue, errorType: 'BusinessRuleViolation' }).valid
      ).toBe(true)
    })

    test('validation fails with an unknown category', () => {
      expect(validateAjv({ ...issue, errorType: 'NOT_PROVIDED' }).valid).toBe(
        false
      )
    })
  })

  describe('Scenario: An issue carries an unknown field', () => {
    test('validation fails', () => {
      expect(validateAjv({ ...issue, field: 'producer' }).valid).toBe(false)
    })
  })
})
