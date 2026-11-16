import { treatment, validatorFor, wasteItem } from '../../test-helpers.js'

const validateAjv = validatorFor('common/waste-item/waste-item.schema.json')

// The rules for physical details live in physical-details.test.js and
// weight.test.js; these cover the waste item itself and prove its
// physicalDetails is checked against physical-details.schema.json.
describe('Feature: Schema - declaring a waste item', () => {
  describe('Scenario: Validation passes when a waste item and its valid physical details are declared', () => {
    test('validation passes when the physical details are valid', () => {
      expect(validateAjv(wasteItem).valid).toBe(true)
    })
  })

  describe('Scenario: Validation fails when a waste item is declared without physical details', () => {
    test('validation fails and the physical details are reported as required', () => {
      const { valid, errors } = validateAjv({})

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'physicalDetails' }
        })
      )
    })
  })

  // The classification's rules are covered by classification.test.js — these
  // confirm it's required and that the $ref wiring is live.
  describe('Scenario: Validation fails when a waste item is declared without a classification', () => {
    test('validation fails and the classification is reported as required', () => {
      const { classification, ...withoutClassification } = wasteItem
      const { valid, errors } = validateAjv(withoutClassification)

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'classification' }
        })
      )
    })

    test('rejects a waste item whose classification is invalid, reporting the error against it', () => {
      const { valid, errors } = validateAjv({
        ...wasteItem,
        classification: { ...wasteItem.classification, ewcCodes: ['2001'] }
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'pattern',
          instancePath: '/classification/ewcCodes/0'
        })
      )
    })
  })

  // A treatment's rules are covered by treatment.test.js and treatments.test.js
  // — these confirm treatments is optional and that the $ref wiring is live.
  describe('Scenario: Validation passes when a waste item declares its treatments', () => {
    test('validation passes when the treatments are valid', () => {
      expect(validateAjv({ ...wasteItem, treatments: [treatment] }).valid).toBe(
        true
      )
    })

    test('validation passes when no treatments are declared', () => {
      expect(validateAjv(wasteItem).valid).toBe(true)
    })
  })

  describe('Scenario: Validation fails when a waste item declares an empty list of treatments', () => {
    test('validation fails and at least one treatment is reported as required', () => {
      const { valid, errors } = validateAjv({ ...wasteItem, treatments: [] })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'minItems',
          instancePath: '/treatments'
        })
      )
    })
  })

  describe('Additional coverage', () => {
    test('rejects a waste item whose treatment is invalid, reporting the error against that treatment', () => {
      const { valid, errors } = validateAjv({
        ...wasteItem,
        treatments: [{ ...treatment, disposalOrRecoveryCode: 'R99' }]
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'enum',
          instancePath: '/treatments/0/disposalOrRecoveryCode'
        })
      )
    })

    test('rejects a waste item whose physical details are invalid, reporting the error against them', () => {
      const { form, ...withoutForm } = wasteItem.physicalDetails
      const { valid, errors } = validateAjv({
        ...wasteItem,
        physicalDetails: withoutForm
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '/physicalDetails',
          params: { missingProperty: 'form' }
        })
      )
    })

    test('rejects a waste item whose weight is invalid, reporting the error against the weight', () => {
      const { valid, errors } = validateAjv({
        ...wasteItem,
        physicalDetails: {
          ...wasteItem.physicalDetails,
          totalWeight: { ...wasteItem.physicalDetails.totalWeight, unit: 'kg' }
        }
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'enum',
          instancePath: '/physicalDetails/totalWeight/unit'
        })
      )
    })

    test('rejects an unknown field on a waste item', () => {
      const { valid, errors } = validateAjv({ ...wasteItem, ewcCode: '200301' })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'additionalProperties',
          instancePath: ''
        })
      )
    })
  })
})
