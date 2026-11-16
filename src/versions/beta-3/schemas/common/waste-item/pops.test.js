import { pops, popsPresent, validatorFor } from '../../test-helpers.js'

const validateAjv = validatorFor('common/waste-item/pops.schema.json')

// The business scenarios live in
// routes/record-receipt-undocumented.test.js, and a component's
// own rules in pop-component.test.js. These cover the edges of the
// declaration's shape that the scenarios don't.
describe('Feature: Schema - declaring persistent organic pollutants', () => {
  describe('Additional coverage', () => {
    test('accepts waste declared as not containing POPs', () => {
      expect(validateAjv(pops).valid).toBe(true)
    })

    test('accepts waste declared as containing POPs, with their details', () => {
      expect(validateAjv(popsPresent).valid).toBe(true)
    })

    test('rejects a source alone for waste declared as not containing POPs', () => {
      const { valid, errors } = validateAjv({
        isPresent: false,
        componentsSource: 'GUIDANCE'
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'not',
          instancePath: '/componentsSource'
        })
      )
    })

    test('reports both missing details when only isPresent is given', () => {
      const { valid, errors } = validateAjv({ isPresent: true })

      expect(valid).toBe(false)
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: 'required',
            params: { missingProperty: 'componentsSource' }
          }),
          expect.objectContaining({
            keyword: 'required',
            params: { missingProperty: 'components' }
          })
        ])
      )
    })

    test('reports an invalid component against that component', () => {
      const { valid, errors } = validateAjv({
        ...popsPresent,
        components: [
          ...popsPresent.components,
          { unit: 'MG_PER_KG', amount: 1 }
        ]
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '/components/1',
          params: { missingProperty: 'code' }
        })
      )
    })

    // The fields this replaces.
    test.each([
      ['containsPops', { ...pops, containsPops: false }],
      ['pops', { ...pops, pops: [] }]
    ])('rejects an unknown field, %s', (_, value) => {
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
})
