import { DISPOSAL_OR_RECOVERY_CODES } from '@defra/waste-movement-utils'
import { validators } from '../../validators.js'
import { treatment, validatorFor, weight } from '../../test-helpers.js'

const schemaId = 'common/waste-item/treatment.schema.json'
const validateAjv = validatorFor(schemaId)

describe('Feature: Schema - declaring a treatment', () => {
  const withoutField = (field) => {
    const { [field]: excluded, ...payload } = treatment
    return payload
  }

  const missing = (missingProperty) =>
    expect.objectContaining({
      keyword: 'required',
      instancePath: '',
      params: { missingProperty }
    })

  describe('Scenario: Validation passes when a valid treatment is declared', () => {
    test('validation passes when the code and weight are valid', () => {
      expect(validateAjv(treatment).valid).toBe(true)
    })
  })

  describe('Scenario: Validation fails when the disposal or recovery code is missing', () => {
    test('validation fails and the code is reported as required', () => {
      const { valid, errors } = validateAjv(
        withoutField('disposalOrRecoveryCode')
      )

      expect(valid).toBe(false)
      expect(errors).toContainEqual(missing('disposalOrRecoveryCode'))
    })
  })

  describe('Scenario: Validation fails when the weight is missing', () => {
    test('validation fails and the weight is reported as required', () => {
      const { valid, errors } = validateAjv(withoutField('weight'))

      expect(valid).toBe(false)
      expect(errors).toContainEqual(missing('weight'))
    })
  })

  describe('Scenario: Validation fails when the code is not a recognised disposal or recovery code', () => {
    test.each([
      ['an unknown code', 'R14'],
      ['an unknown disposal code', 'D16'],
      ['a lower-case code', 'r3'],
      ['an empty string', '']
    ])('validation fails for %s (%s)', (_label, disposalOrRecoveryCode) => {
      const { valid, errors } = validateAjv({
        ...treatment,
        disposalOrRecoveryCode
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'enum',
          instancePath: '/disposalOrRecoveryCode'
        })
      )
    })
  })

  describe('Additional coverage', () => {
    // weight's own rules are covered by weight.test.js — this confirms the
    // $ref wiring is live.
    test('rejects an invalid weight, reporting the error against the weight', () => {
      const { valid, errors } = validateAjv({
        ...treatment,
        weight: { ...weight, amount: 0 }
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'exclusiveMinimum',
          instancePath: '/weight/amount'
        })
      )
    })

    test('rejects an unknown field on a treatment', () => {
      const { valid, errors } = validateAjv({ ...treatment, extra: true })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'additionalProperties' })
      )
    })
  })

  // The schema can't import the shared code list (see schemas/README.md),
  // so this holds it to the list instead.
  describe('parity with the shared waste-movement-utils codes', () => {
    test('allows exactly the DISPOSAL_OR_RECOVERY_CODES', () => {
      const { enum: codes } =
        validators.ajv.getSchema(schemaId).schema.properties
          .disposalOrRecoveryCode

      expect([...codes].sort()).toEqual([...DISPOSAL_OR_RECOVERY_CODES].sort())
    })

    test.each(DISPOSAL_OR_RECOVERY_CODES)('accepts %s', (code) => {
      expect(
        validateAjv({ ...treatment, disposalOrRecoveryCode: code }).valid
      ).toBe(true)
    })
  })
})
