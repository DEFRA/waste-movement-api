import { validEwcCodes } from '@defra/waste-movement-utils'
import { classification, validatorFor, longText } from '../../test-helpers.js'

const validateAjv = validatorFor('common/waste-item/classification.schema.json')

// The business scenarios — a missing or empty description, missing or
// unrecognised EWC codes, and between one and five codes — live in
// routes/create-movement.test.js, those for POPs in
// routes/record-receipt-undocumented.test.js, and those for
// hazardous properties in both. The schema checks
// only an EWC code's format; whether a well-formed code is recognised is
// checked by common/helpers/waste-reference-data-checks.js. These cover
// what's left of the classification's shape.
describe('Feature: Schema - classifying a waste item', () => {
  const withCode = (code) => ({ ...classification, ewcCodes: [code] })

  describe('Scenario: Every code in the EWC reference data is in the accepted format', () => {
    test('accepts every code', () => {
      const rejected = validEwcCodes
        .map(({ code }) => code)
        .filter((code) => !validateAjv(withCode(code)).valid)

      expect(rejected).toEqual([])
    })
  })

  describe('Scenario: Validation fails for an EWC code that is not six digits', () => {
    test.each(['2003011', '200301 ', 'INVALID'])('rejects %p', (code) => {
      const { valid, errors } = validateAjv(withCode(code))

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'pattern',
          instancePath: '/ewcCodes/0'
        })
      )
    })

    test('rejects a code given as a number', () => {
      const { valid, errors } = validateAjv(withCode(200301))

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/ewcCodes/0'
        })
      )
    })
  })

  describe('Additional coverage', () => {
    test('accepts a valid classification', () => {
      expect(validateAjv(classification).valid).toBe(true)
    })

    test('reports a badly formatted EWC code against that code, not the first', () => {
      const { valid, errors } = validateAjv({
        ...classification,
        ewcCodes: ['200301', '2001']
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'pattern',
          instancePath: '/ewcCodes/1'
        })
      )
    })

    test('rejects a single EWC code rather than a list', () => {
      const { valid, errors } = validateAjv({
        ...classification,
        ewcCodes: '200301'
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'type', instancePath: '/ewcCodes' })
      )
    })

    test('rejects a waste description that is not a string', () => {
      const { valid, errors } = validateAjv({
        ...classification,
        wasteDescription: 42
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/wasteDescription'
        })
      )
    })

    // The rules for POPs are covered by pops.test.js and the receipt
    // scenarios — these confirm pops is required and its $ref is live.
    test('requires pops', () => {
      const { pops, ...withoutPops } = classification
      const { valid, errors } = validateAjv(withoutPops)

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'pops' }
        })
      )
    })

    test('rejects a classification whose pops are invalid, reporting the error against them', () => {
      const { valid, errors } = validateAjv({
        ...classification,
        pops: { isPresent: 'Maybe' }
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/pops/isPresent'
        })
      )
    })

    // Likewise for hazardous properties, covered by hazardous.test.js and
    // the create and receipt scenarios.
    test('requires hazardous', () => {
      const { hazardous, ...withoutHazardous } = classification
      const { valid, errors } = validateAjv(withoutHazardous)

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'hazardous' }
        })
      )
    })

    test('rejects a classification whose hazardous properties are invalid, reporting the error against them', () => {
      const { valid, errors } = validateAjv({
        ...classification,
        hazardous: { isPresent: true, codes: ['HP_22'] }
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'enum',
          instancePath: '/hazardous/codes/0'
        })
      )
    })

    test('rejects an unknown field on a classification', () => {
      const { valid, errors } = validateAjv({
        ...classification,
        ewcCode: '200301'
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
    test.each([['wasteDescription', longText, classification]])(
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
