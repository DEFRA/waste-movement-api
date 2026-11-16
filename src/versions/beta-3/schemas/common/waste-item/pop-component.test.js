import { popComponent, validatorFor, shortText } from '../../test-helpers.js'

const validateAjv = validatorFor('common/waste-item/pop-component.schema.json')

// The business scenarios — codes, amounts, units, thresholds, and one or
// the other but not both — live in
// routes/record-receipt-undocumented.test.js. Whether a code is
// recognised is checked by common/helpers/waste-reference-data-checks.js.
// These cover the edges of the component's own rules.
describe('Feature: Schema - declaring a POP component', () => {
  describe('Additional coverage', () => {
    test('accepts an amount with a unit', () => {
      expect(validateAjv(popComponent).valid).toBe(true)
    })

    test('accepts a very small amount', () => {
      expect(
        validateAjv({ code: 'PFOA', unit: 'MG_PER_KG', amount: 1e-9 }).valid
      ).toBe(true)
    })

    test.each(['0.5', 'abc', '', null, true])(
      'rejects an amount of %p, which is not a number',
      (amount) => {
        const { valid, errors } = validateAjv({ ...popComponent, amount })

        expect(valid).toBe(false)
        expect(errors).toContainEqual(
          expect.objectContaining({ keyword: 'type', instancePath: '/amount' })
        )
      }
    )

    test('does not require a unit when only a threshold is given', () => {
      expect(validateAjv({ code: 'PFOA', threshold: 'LESS_THAN' }).valid).toBe(
        true
      )
    })

    test('rejects a unit in lower case', () => {
      const { valid, errors } = validateAjv({
        ...popComponent,
        unit: 'mg_per_kg'
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'enum',
          instancePath: '/unit'
        })
      )
    })

    test('rejects a threshold in lower case', () => {
      const { valid, errors } = validateAjv({
        code: 'PFOA',
        threshold: 'less_than'
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'enum',
          instancePath: '/threshold'
        })
      )
    })

    test('rejects a code that is not a string', () => {
      const { valid, errors } = validateAjv({ ...popComponent, code: 42 })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'type', instancePath: '/code' })
      )
    })

    // The ROW names for the amount and threshold.
    test.each([
      ['name', { ...popComponent, name: 'PFOA' }],
      ['concentration', { ...popComponent, concentration: 0.5 }],
      [
        'concentrationThresholdOperator',
        { ...popComponent, concentrationThresholdOperator: 'LESS_THAN' }
      ]
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
    test.each([['code', shortText, popComponent]])(
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
