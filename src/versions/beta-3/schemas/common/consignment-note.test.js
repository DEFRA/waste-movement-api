import { validatorFor, longText } from '../test-helpers.js'

const validateAjv = validatorFor('common/consignment-note.schema.json')

// The business scenarios — each regulator's format, a code or a reason but
// not both, and when hazardous waste needs a note at all — live in
// routes/create-movement.test.js. These cover the edges of the note's
// own rules that those scenarios don't.
describe('Feature: Schema - declaring a consignment note', () => {
  describe('Scenario: Validation passes for the edges of the regulator formats', () => {
    test.each([
      ['EA / NRW, with a digit in the premises code', 'CJ123E/A0001'],
      ['EA / NRW, with a trailing letter', 'CJTILE/A0001B'],
      ['EA / NRW, in lower case', 'cjtile/a0001']
    ])('accepts an %s', (_format, code) => {
      expect(validateAjv({ code }).valid).toBe(true)
    })
  })

  describe('Scenario: Validation fails just outside the regulator formats', () => {
    test.each([
      ['a SEPA code one digit short', 'SA123456'],
      ['a NIEA code one digit long', 'DA12345678'],
      ['an EA / NRW code with a short serial', 'CJTILE/A01'],
      ['an EA / NRW code with a one-character premises code', 'C/A0001'],
      ['a SEPA code in lower case', 'sa1234567']
    ])('rejects %s', (_, code) => {
      const { valid, errors } = validateAjv({ code })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'pattern', instancePath: '/code' })
      )
    })
  })

  // An optional field is left out when there's no value (see the schemas
  // README), so null and "" are rejected rather than read as "not provided".
  describe('Scenario: A null or empty field is rejected', () => {
    test.each([
      [null, 'type'],
      ['', 'pattern']
    ])('rejects a code of %p', (code, keyword) => {
      const { valid, errors } = validateAjv({ code })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword, instancePath: '/code' })
      )
    })

    test.each([
      [null, 'type'],
      ['', 'minLength']
    ])('rejects a reason of %p', (reasonForNoCode, keyword) => {
      const { valid, errors } = validateAjv({ reasonForNoCode })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword, instancePath: '/reasonForNoCode' })
      )
    })

    test('accepts an empty consignment note', () => {
      expect(validateAjv({}).valid).toBe(true)
    })
  })

  describe('Additional coverage', () => {
    test('rejects a code given as a number', () => {
      const { valid, errors } = validateAjv({ code: 1234567 })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'type', instancePath: '/code' })
      )
    })

    test('rejects a reason given as a number', () => {
      const { valid, errors } = validateAjv({ reasonForNoCode: 3 })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/reasonForNoCode'
        })
      )
    })

    test('rejects the fields it replaces', () => {
      const { valid, errors } = validateAjv({
        hazardousWasteConsignmentCode: 'CJTILE/A0001'
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'additionalProperties',
          instancePath: ''
        })
      )
    })
  })

  describe('Scenario: Free text longer than its length limit is rejected', () => {
    test.each([['reasonForNoCode', longText, {}]])(
      '%s is accepted at %i characters and rejected at one more',
      (field, limit, base) => {
        expect(validateAjv({ ...base, [field]: 'A'.repeat(limit) }).valid).toBe(
          true
        )

        const { valid, errors } = validateAjv({
          ...base,
          [field]: 'A'.repeat(limit + 1)
        })
        expect(valid).toBe(false)
        expect(errors).toContainEqual(
          expect.objectContaining({
            keyword: 'maxLength',
            instancePath: `/${field}`,
            params: { limit }
          })
        )
      }
    )
  })
})
