import { validatorFor, weight } from '../../test-helpers.js'

const validateAjv = validatorFor('common/waste-item/weight.schema.json')

// The weight scenarios from the "Declaring the physical form, containers and
// weight of the waste" features for creating a waste movement and for
// creating a receipt, which share these rules. An empty string is a
// value, so JSON Schema rejects it as the wrong value or type rather than as
// missing — the feature's "required" for "" is covered by it being rejected.
describe('Feature: Declaring the weight of the waste', () => {
  const withoutField = (field) => {
    const { [field]: excluded, ...payload } = weight
    return payload
  }

  const missing = (missingProperty) =>
    expect.objectContaining({
      keyword: 'required',
      instancePath: '',
      params: { missingProperty }
    })

  const invalid = (keyword, instancePath) =>
    expect.objectContaining({ keyword, instancePath })

  describe('Scenario: Validation passes when a valid weight is declared', () => {
    test('validation passes when the amount, unit and estimated-or-actual are valid', () => {
      expect(validateAjv(weight).valid).toBe(true)
    })
  })

  describe('Scenario Outline: Validation fails when the unit of measurement is missing or invalid', () => {
    describe('Examples: Not provided or empty', () => {
      test('the unit of measurement is required when not provided', () => {
        const { valid, errors } = validateAjv(withoutField('unit'))

        expect(valid).toBe(false)
        expect(errors).toContainEqual(missing('unit'))
      })

      test('an empty unit of measurement is rejected', () => {
        const { valid, errors } = validateAjv({ ...weight, unit: '' })

        expect(valid).toBe(false)
        expect(errors).toContainEqual(invalid('enum', '/unit'))
      })
    })

    describe('Examples: Not a permitted value', () => {
      test.each([['Pounds'], ['Litres'], ['kg']])(
        'a unit of measurement of %s is not recognised',
        (unit) => {
          const { valid, errors } = validateAjv({ ...weight, unit })

          expect(valid).toBe(false)
          expect(errors).toContainEqual(invalid('enum', '/unit'))
        }
      )
    })
  })

  describe('Scenario Outline: Validation fails when the weight amount is missing or invalid', () => {
    describe('Examples: Not provided or empty', () => {
      test('the weight amount is required when not provided', () => {
        const { valid, errors } = validateAjv(withoutField('amount'))

        expect(valid).toBe(false)
        expect(errors).toContainEqual(missing('amount'))
      })

      test('an empty weight amount is rejected', () => {
        const { valid, errors } = validateAjv({ ...weight, amount: '' })

        expect(valid).toBe(false)
        expect(errors).toContainEqual(invalid('type', '/amount'))
      })
    })

    describe('Examples: Not greater than 0', () => {
      test.each([[0], [-1]])(
        'a weight amount of %d is not greater than 0',
        (amount) => {
          const { valid, errors } = validateAjv({ ...weight, amount })

          expect(valid).toBe(false)
          expect(errors).toContainEqual(invalid('exclusiveMinimum', '/amount'))
        }
      )
    })
  })

  describe('Scenario Outline: Validation fails when the statement of the weight being estimated or actual is missing or invalid', () => {
    describe('Examples: Not provided or empty', () => {
      test('whether the weight is estimated or actual is required when not provided', () => {
        const { valid, errors } = validateAjv(withoutField('isEstimate'))

        expect(valid).toBe(false)
        expect(errors).toContainEqual(missing('isEstimate'))
      })

      test('an empty statement of whether the weight is estimated or actual is rejected', () => {
        const { valid, errors } = validateAjv({ ...weight, isEstimate: '' })

        expect(valid).toBe(false)
        expect(errors).toContainEqual(invalid('type', '/isEstimate'))
      })
    })

    describe('Examples: Not recognised', () => {
      test.each([['Maybe'], ['Unknown']])(
        'whether the weight is estimated or actual of %s is not recognised',
        (isEstimate) => {
          const { valid, errors } = validateAjv({ ...weight, isEstimate })

          expect(valid).toBe(false)
          expect(errors).toContainEqual(invalid('type', '/isEstimate'))
        }
      )
    })
  })

  describe('Additional coverage', () => {
    test.each([['GRAMS'], ['KILOGRAMS'], ['TONNES']])(
      'accepts a unit of %s',
      (unit) => {
        expect(validateAjv({ ...weight, unit }).valid).toBe(true)
      }
    )

    test.each([[true], [false]])(
      'accepts an estimated-or-actual statement of %s',
      (isEstimate) => {
        expect(validateAjv({ ...weight, isEstimate }).valid).toBe(true)
      }
    )

    test('accepts a fractional amount just above 0', () => {
      expect(validateAjv({ ...weight, amount: 0.001 }).valid).toBe(true)
    })

    test('rejects an unknown field on a weight', () => {
      const { valid, errors } = validateAjv({ ...weight, grossWeight: 300 })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(invalid('additionalProperties', ''))
    })
  })
})
