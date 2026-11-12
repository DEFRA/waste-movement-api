import {
  hazardousComponent,
  validatorFor,
  shortText
} from '../../test-helpers.js'

const validateAjv = validatorFor(
  'common/waste-item/hazardous-component.schema.json'
)

// The business scenarios — names, amounts, units, thresholds, and one or the
// other but not both — live in waste-item/hazardous.test.js and the routes'
// tests. These cover the edges of the component's own rules.
describe('Feature: Schema - declaring a hazardous component', () => {
  describe('Additional coverage', () => {
    test('accepts an amount with a unit', () => {
      expect(validateAjv(hazardousComponent).valid).toBe(true)
    })

    test('accepts a very small amount', () => {
      expect(
        validateAjv({ name: 'Mercury', unit: 'MG_PER_KG', amount: 1e-9 }).valid
      ).toBe(true)
    })

    // Any name will do: it isn't checked against reference data.
    test('accepts a name that is not a recognised substance', () => {
      expect(
        validateAjv({ ...hazardousComponent, name: 'Unknown mixture 42' }).valid
      ).toBe(true)
    })

    test.each(['0.5', 'abc', '', null, true])(
      'rejects an amount of %p, which is not a number',
      (amount) => {
        const { valid, errors } = validateAjv({ ...hazardousComponent, amount })

        expect(valid).toBe(false)
        expect(errors).toContainEqual(
          expect.objectContaining({ keyword: 'type', instancePath: '/amount' })
        )
      }
    )

    test('does not require a unit when only a threshold is given', () => {
      expect(
        validateAjv({ name: 'Mercury', threshold: 'EQUAL_TO' }).valid
      ).toBe(true)
    })

    test('rejects a unit in lower case', () => {
      const { valid, errors } = validateAjv({
        ...hazardousComponent,
        unit: 'mg_per_kg'
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'enum', instancePath: '/unit' })
      )
    })

    // Unlike a POP, a hazardous component can't be below its threshold.
    test.each(['LESS_THAN', 'greater_than'])(
      'rejects a threshold of %p',
      (threshold) => {
        const { valid, errors } = validateAjv({ name: 'Mercury', threshold })

        expect(valid).toBe(false)
        expect(errors).toContainEqual(
          expect.objectContaining({
            keyword: 'enum',
            instancePath: '/threshold'
          })
        )
      }
    )

    test('rejects a name that is not a string', () => {
      const { valid, errors } = validateAjv({ ...hazardousComponent, name: 42 })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'type', instancePath: '/name' })
      )
    })

    test.each([
      ['code', { ...hazardousComponent, code: 'PFOA' }],
      ['concentration', { ...hazardousComponent, concentration: 5 }]
    ])('rejects an unknown field on a component, %s', (_, value) => {
      const { valid, errors } = validateAjv(value)

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
    test.each([['name', shortText, hazardousComponent]])(
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
