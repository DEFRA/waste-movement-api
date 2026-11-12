import { longText, validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor(
  'common/special-handling-requirements.schema.json'
)

describe('Feature: Recording special handling requirements on a Movement', () => {
  // The feature file set 500 characters. It now has the long-text limit every
  // free-text description in this version shares, which is also ROW's
  // published limit — see "Free text has a maxLength" in schemas/README.md.
  const maxLength = longText

  describe('Scenario: A Movement is successfully created with special handling requirements', () => {
    test('the special handling requirements are accepted when they are shorter than the character limit', () => {
      expect(validateAjv('Handle with care and keep upright.').valid).toBe(true)
    })

    test('the special handling requirements are accepted when they are exactly the long-text limit', () => {
      expect(validateAjv('A'.repeat(maxLength)).valid).toBe(true)
    })
  })

  describe("Scenario: A Movement isn't created when special handling requirements exceeds the character limit", () => {
    test('the special handling requirements are rejected when they are longer than the long-text limit', () => {
      expect(validateAjv('A'.repeat(maxLength + 1)).valid).toBe(false)
    })

    test('the rejection reports that the long-text limit was exceeded', () => {
      const { errors } = validateAjv('A'.repeat(maxLength + 1))
      expect(errors).toEqual([
        expect.objectContaining({
          keyword: 'maxLength',
          params: { limit: maxLength }
        })
      ])
    })
  })

  // -------------------------------------------------------------------------
  // Coverage below isn't called out by any scenario in the feature file.
  // "A Movement is successfully created without special handling requirements"
  // is about the field being optional, so it is pinned on the payload instead,
  // in creation/create-movement-request.test.js.
  // -------------------------------------------------------------------------
  describe('Additional coverage: Recording special handling requirements', () => {
    test('rejects an empty string, because absent requirements are recorded by omitting the field', () => {
      expect(validateAjv('').valid).toBe(false)
    })

    test.each([
      ['a number', 123],
      ['null', null],
      ['an array of strings', ['Handle with care.']]
    ])('rejects %s', (_, value) => {
      expect(validateAjv(value).valid).toBe(false)
    })
  })
})
