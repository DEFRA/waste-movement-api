import { physicalDetails, validatorFor } from '../../test-helpers.js'

const validateAjv = validatorFor(
  'common/waste-item/physical-details.schema.json'
)

// The physical form and container scenarios from the "Declaring the physical
// form, containers and weight of the waste" features for creating a waste
// movement and for creating a receipt, which share these rules.
// The weight's own rules are covered by weight.test.js. An empty string is a
// value, so JSON Schema rejects it as the wrong value or type rather than as
// missing — the feature's "required" for "" is covered by it being rejected.
describe('Feature: Declaring the physical form, containers and weight of the waste', () => {
  const withoutField = (field, from = physicalDetails) => {
    const { [field]: excluded, ...payload } = from
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

  describe('Scenario: Validation passes when a valid physical form, containers and weight are declared', () => {
    test('validation passes when the physical form, container type, number of containers and weight are valid', () => {
      expect(validateAjv(physicalDetails).valid).toBe(true)
    })
  })

  describe('Scenario Outline: Validation fails when the physical form is missing or invalid', () => {
    describe('Examples: Not provided or empty', () => {
      test('the physical form is required when not provided', () => {
        const { valid, errors } = validateAjv(withoutField('form'))

        expect(valid).toBe(false)
        expect(errors).toContainEqual(missing('form'))
      })

      test('an empty physical form is rejected', () => {
        const { valid, errors } = validateAjv({ ...physicalDetails, form: '' })

        expect(valid).toBe(false)
        expect(errors).toContainEqual(invalid('enum', '/form'))
      })
    })

    // The movement feature lists SOLID here, but SOLID is a permitted form in
    // the agreed type definition; the receipt feature lists 'solid', which
    // covers the intent — permitted values are case-sensitive.
    describe('Examples: Not a permitted value', () => {
      test.each([['Plasma'], ['solid']])(
        'a physical form of %s is not recognised',
        (form) => {
          const { valid, errors } = validateAjv({ ...physicalDetails, form })

          expect(valid).toBe(false)
          expect(errors).toContainEqual(invalid('enum', '/form'))
        }
      )
    })
  })

  describe('Scenario Outline: Validation fails when the container type is missing or invalid', () => {
    describe('Examples: Not provided or empty', () => {
      test('the container type is required when not provided', () => {
        const { valid, errors } = validateAjv(withoutField('containerType'))

        expect(valid).toBe(false)
        expect(errors).toContainEqual(missing('containerType'))
      })

      test('an empty container type is rejected', () => {
        const { valid, errors } = validateAjv({
          ...physicalDetails,
          containerType: ''
        })

        expect(valid).toBe(false)
        expect(errors).toContainEqual(invalid('enum', '/containerType'))
      })
    })

    describe('Examples: Not valid', () => {
      test.each([['XYZ'], ['DRUM']])(
        'a container type of %s is not recognised',
        (containerType) => {
          const { valid, errors } = validateAjv({
            ...physicalDetails,
            containerType
          })

          expect(valid).toBe(false)
          expect(errors).toContainEqual(invalid('enum', '/containerType'))
        }
      )
    })
  })

  describe('Scenario Outline: Validation fails when the number of containers is missing or invalid', () => {
    describe('Examples: Not provided or empty', () => {
      test('the number of containers is required when not provided', () => {
        const { valid, errors } = validateAjv(withoutField('containerCount'))

        expect(valid).toBe(false)
        expect(errors).toContainEqual(missing('containerCount'))
      })

      test('an empty number of containers is rejected', () => {
        const { valid, errors } = validateAjv({
          ...physicalDetails,
          containerCount: ''
        })

        expect(valid).toBe(false)
        expect(errors).toContainEqual(invalid('type', '/containerCount'))
      })
    })

    describe('Examples: Not a whole number of 0 or more', () => {
      test('a number of containers of -1 is not a whole number of 0 or more', () => {
        const { valid, errors } = validateAjv({
          ...physicalDetails,
          containerCount: -1
        })

        expect(valid).toBe(false)
        expect(errors).toContainEqual(invalid('minimum', '/containerCount'))
      })

      test('a number of containers of 1.5 is not a whole number of 0 or more', () => {
        const { valid, errors } = validateAjv({
          ...physicalDetails,
          containerCount: 1.5
        })

        expect(valid).toBe(false)
        expect(errors).toContainEqual(invalid('type', '/containerCount'))
      })
    })
  })

  describe('Scenario: Validation passes when the waste is loose and no containers are used', () => {
    test('validation passes with a loose container type and 0 containers', () => {
      const payload = {
        ...physicalDetails,
        containerType: 'LOO',
        containerCount: 0
      }

      expect(validateAjv(payload).valid).toBe(true)
    })
  })

  describe('Scenario Outline: Validation fails when the number of containers does not match whether the waste is loose', () => {
    describe('Examples: Not consistent with the container type', () => {
      test('a loose container type with 1 container is not consistent with the container type', () => {
        const { valid, errors } = validateAjv({
          ...physicalDetails,
          containerType: 'LOO',
          containerCount: 1
        })

        expect(valid).toBe(false)
        expect(errors).toContainEqual(invalid('const', '/containerCount'))
      })

      test('a drum container type with 0 containers is not consistent with the container type', () => {
        const { valid, errors } = validateAjv({
          ...physicalDetails,
          containerType: 'DRU',
          containerCount: 0
        })

        expect(valid).toBe(false)
        expect(errors).toContainEqual(invalid('minimum', '/containerCount'))
      })
    })
  })

  describe('Scenario: Validation fails when no weight is declared', () => {
    test('validation fails and the weight is reported as required', () => {
      const { valid, errors } = validateAjv(withoutField('totalWeight'))

      expect(valid).toBe(false)
      expect(errors).toContainEqual(missing('totalWeight'))
    })
  })

  describe('Additional coverage', () => {
    test.each([
      ['GAS'],
      ['LIQUID'],
      ['SOLID'],
      ['POWDER'],
      ['SLUDGE'],
      ['MIXED']
    ])('accepts a physical form of %s', (form) => {
      expect(validateAjv({ ...physicalDetails, form }).valid).toBe(true)
    })

    test.each([
      ['BAG'],
      ['BAL'],
      ['BOX'],
      ['CAN'],
      ['CAR'],
      ['CAS'],
      ['CON'],
      ['DRU'],
      ['FIB'],
      ['IBC'],
      ['PAL'],
      ['ROR'],
      ['SKI'],
      ['TAN'],
      ['WBI']
    ])('accepts a container type of %s with 1 container', (containerType) => {
      expect(
        validateAjv({ ...physicalDetails, containerType, containerCount: 1 })
          .valid
      ).toBe(true)
    })

    // The weight's own rules live in weight.test.js; this only proves the
    // $ref is wired up, so a rejection propagates to the physical details.
    test('rejects physical details whose weight is invalid, reporting the error against the weight', () => {
      const { valid, errors } = validateAjv({
        ...physicalDetails,
        totalWeight: { ...physicalDetails.totalWeight, amount: 0 }
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        invalid('exclusiveMinimum', '/totalWeight/amount')
      )
    })

    test('rejects an unknown field on the physical details', () => {
      const { valid, errors } = validateAjv({
        ...physicalDetails,
        colour: 'Brown'
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(invalid('additionalProperties', ''))
    })
  })
})
