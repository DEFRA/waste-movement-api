import {
  supportingReference,
  validatorFor,
  shortText
} from '../test-helpers.js'

const validateAjv = validatorFor('common/supporting-references.schema.json')

describe('Feature: Recording supporting references', () => {
  const recognisedLabels = [
    'WEIGHBRIDGE_NUMBER',
    'PO_NUMBER',
    'JOB_NUMBER',
    'INVOICE_NUMBER',
    'WASTE_TICKET_NUMBER'
  ]

  const supportingReferences = [supportingReference]

  const buildSupportingReferences = (count) =>
    Array.from({ length: count }, (_, index) => ({
      ...supportingReference,
      reference: `PO-${index + 1}`
    }))

  describe('Scenario: Supporting references are provided correctly', () => {
    test('the supporting references are accepted when one is provided with a recognised label and a reference', () => {
      expect(validateAjv(supportingReferences).valid).toBe(true)
    })

    test('the supporting references are accepted when more than one is provided, each with a recognised label and a reference', () => {
      expect(validateAjv(buildSupportingReferences(3)).valid).toBe(true)
    })

    test.each(recognisedLabels)(
      'the supporting references are accepted when a supporting reference has the recognised label "%s"',
      (label) => {
        const payload = [{ ...supportingReference, label }]
        expect(validateAjv(payload).valid).toBe(true)
      }
    )
  })

  describe('Scenario: A supporting reference labelled OTHER says what kind of reference it is', () => {
    test('the supporting references are accepted when a reference labelled OTHER has an other label', () => {
      const payload = [
        {
          ...supportingReference,
          label: 'OTHER',
          otherLabel: 'Skip hire number'
        }
      ]
      expect(validateAjv(payload).valid).toBe(true)
    })

    test("the supporting references are rejected when a reference labelled OTHER doesn't say what kind it is", () => {
      const { valid, errors } = validateAjv([
        { ...supportingReference, label: 'OTHER' }
      ])

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '/0',
          params: { missingProperty: 'otherLabel' }
        })
      )
    })

    test('the supporting references are rejected when a reference with a recognised label also has an other label', () => {
      const { valid, errors } = validateAjv([
        { ...supportingReference, otherLabel: 'Skip hire number' }
      ])

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'not',
          instancePath: '/0/otherLabel'
        })
      )
    })
  })

  describe("Scenario: A supporting reference's label and reference aren't provided as a pair", () => {
    test.each([
      ['a reference', 'label'],
      ['a label', 'reference']
    ])(
      'the supporting references are rejected when one has %s and no %s',
      (_, missingField) => {
        const { [missingField]: excluded, ...item } = supportingReference
        expect(validateAjv([item]).valid).toBe(false)
      }
    )
  })

  describe("Scenario: A supporting reference's reference exceeds the maximum length", () => {
    test('the supporting references are rejected when a reference is longer than the short-text limit', () => {
      const payload = [
        { ...supportingReference, reference: 'A'.repeat(shortText + 1) }
      ]
      expect(validateAjv(payload).valid).toBe(false)
    })

    test('the supporting references are accepted when a reference is exactly the short-text limit', () => {
      const payload = [
        { ...supportingReference, reference: 'A'.repeat(shortText) }
      ]
      expect(validateAjv(payload).valid).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // Coverage below isn't called out by any scenario in the feature file, but
  // follows from it requiring "one or more" supporting references, each with a
  // "recognised label".
  // -------------------------------------------------------------------------
  describe('Additional coverage: Recording supporting references', () => {
    test('rejects an empty other label', () => {
      const payload = [
        { ...supportingReference, label: 'OTHER', otherLabel: '' }
      ]
      expect(validateAjv(payload).valid).toBe(false)
    })

    test('rejects an empty array', () => {
      expect(validateAjv([]).valid).toBe(false)
    })

    test.each([
      ['an unrecognised label', 'Purchase order'],
      ['a recognised label in mismatched case', 'PO NUMBER'],
      ['an empty label', '']
    ])('rejects %s', (_, label) => {
      const payload = [{ ...supportingReference, label }]
      expect(validateAjv(payload).valid).toBe(false)
    })
  })
})
