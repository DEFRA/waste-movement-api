import {
  address as validAddress,
  validatorFor,
  longText
} from '../test-helpers.js'

const validateAjv = validatorFor('common/address.schema.json')

describe('address schema', () => {
  test('accepts a valid address', () => {
    expect(validateAjv(validAddress).valid).toBe(true)
  })

  test('accepts an address with only postcode (fullAddress is optional)', () => {
    const { fullAddress, ...payload } = validAddress
    expect(validateAjv(payload).valid).toBe(true)
  })

  test('rejects an address missing postcode', () => {
    const { postcode, ...payload } = validAddress
    expect(validateAjv(payload).valid).toBe(false)
  })

  test('rejects an empty fullAddress', () => {
    const payload = { ...validAddress, fullAddress: '' }
    expect(validateAjv(payload).valid).toBe(false)
  })

  test.each([
    'SW1A 1AA',
    'EC1A 1BB',
    'W1A 0AX',
    'M1 1AE',
    'B33 8TH',
    'CR2 6XH',
    'DN55 1PT',
    'GIR 0AA'
  ])('accepts UK postcode %s', (postcode) => {
    expect(validateAjv({ postcode }).valid).toBe(true)
  })

  test.each(['A65 F4E2', 'D02 AF30', 'D6W FA12'])(
    'accepts Irish Eircode %s',
    (postcode) => {
      expect(validateAjv({ postcode }).valid).toBe(true)
    }
  )

  test('rejects a malformed postcode', () => {
    expect(validateAjv({ postcode: 'NOTAPOSTCODE' }).valid).toBe(false)
  })

  test('rejects an address with an extra property', () => {
    expect(validateAjv({ ...validAddress, extra: true }).valid).toBe(false)
  })

  describe('Scenario: Free text longer than its length limit is rejected', () => {
    test.each([['fullAddress', longText, validAddress]])(
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
