import { treatment, validatorFor } from '../../test-helpers.js'

const validateAjv = validatorFor('common/waste-item/treatments.schema.json')

// The rules for a single treatment live in treatment.test.js; these cover the
// list itself and prove each entry is checked against treatment.schema.json.
describe('Feature: Schema - declaring the treatments of the waste', () => {
  describe('Scenario: Validation passes when a single valid treatment is declared', () => {
    test('validation passes when one treatment is submitted', () => {
      expect(validateAjv([treatment]).valid).toBe(true)
    })
  })

  describe('Scenario: Validation passes when more than one treatment is declared', () => {
    test('validation passes when valid details are given for each treatment', () => {
      const disposal = { ...treatment, disposalOrRecoveryCode: 'D10' }

      expect(validateAjv([treatment, disposal]).valid).toBe(true)
    })
  })

  describe('Scenario: Validation fails when an empty list of treatments is declared', () => {
    test('validation fails and at least one treatment is reported as required', () => {
      const { valid, errors } = validateAjv([])

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'minItems', instancePath: '' })
      )
    })
  })

  describe('Additional coverage', () => {
    test('rejects a single treatment rather than a list', () => {
      const { valid, errors } = validateAjv(treatment)

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'type', instancePath: '' })
      )
    })

    test('rejects the list when any one treatment is invalid, reporting the error against that treatment', () => {
      const invalidSecond = { ...treatment, disposalOrRecoveryCode: 'X1' }

      const { valid, errors } = validateAjv([treatment, invalidSecond])

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'enum',
          instancePath: '/1/disposalOrRecoveryCode'
        })
      )
      expect(
        errors.filter(({ instancePath }) => instancePath.startsWith('/0'))
      ).toEqual([])
    })
  })
})
