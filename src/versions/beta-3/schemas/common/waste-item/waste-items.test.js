import { validatorFor, wasteItem } from '../../test-helpers.js'

const validateAjv = validatorFor('common/waste-item/waste-items.schema.json')

// The rules for a single waste item live in waste-item.test.js; these cover
// the list itself and prove each entry is checked against
// waste-item.schema.json.
describe('Feature: Schema - declaring the waste items of a movement', () => {
  describe('Scenario: Validation passes when a single valid waste item is declared', () => {
    test('validation passes when one waste item is submitted', () => {
      expect(validateAjv([wasteItem]).valid).toBe(true)
    })
  })

  describe('Scenario: Validation passes when more than one waste item is declared', () => {
    test('validation passes when valid details are given for each waste item', () => {
      const looseItem = {
        ...wasteItem,
        physicalDetails: {
          ...wasteItem.physicalDetails,
          form: 'MIXED',
          containerType: 'LOO',
          containerCount: 0
        }
      }

      expect(validateAjv([wasteItem, looseItem]).valid).toBe(true)
    })
  })

  describe('Scenario: Validation fails when no waste item is declared', () => {
    test('validation fails and at least one waste item is reported as required', () => {
      const { valid, errors } = validateAjv([])

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'minItems', instancePath: '' })
      )
    })
  })

  describe('Additional coverage', () => {
    test('rejects a single waste item rather than a list', () => {
      const { valid, errors } = validateAjv(wasteItem)

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'type', instancePath: '' })
      )
    })

    test('rejects the list when any one waste item is invalid, reporting the error against that item', () => {
      const invalidSecond = {
        physicalDetails: { ...wasteItem.physicalDetails, containerCount: 0 }
      }

      const { valid, errors } = validateAjv([wasteItem, invalidSecond])

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'minimum',
          instancePath: '/1/physicalDetails/containerCount'
        })
      )
      expect(
        errors.filter(({ instancePath }) => instancePath.startsWith('/0'))
      ).toEqual([])
    })
  })
})
