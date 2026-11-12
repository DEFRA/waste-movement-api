import { deliverySite, shortText, validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor('common/delivery-site.schema.json')

describe('delivery-site schema', () => {
  const withoutField = (field) => {
    const { [field]: excluded, ...payload } = deliverySite
    return payload
  }

  test('accepts a site name, address and RPS numbers', () => {
    expect(validateAjv(deliverySite).valid).toBe(true)
  })

  test('accepts a site without RPS numbers', () => {
    expect(validateAjv(withoutField('rpsNumbers')).valid).toBe(true)
  })

  test('accepts an address without a full address', () => {
    const payload = { ...deliverySite, address: { postcode: 'TE1 3RC' } }
    expect(validateAjv(payload).valid).toBe(true)
  })

  test.each([['organisationName'], ['address']])('%s is required', (field) => {
    const { valid, errors } = validateAjv(withoutField(field))

    expect(valid).toBe(false)
    expect(errors).toContainEqual(
      expect.objectContaining({
        keyword: 'required',
        instancePath: '',
        params: { missingProperty: field }
      })
    )
  })

  test('rejects an empty organisationName', () => {
    const { valid, errors } = validateAjv({
      ...deliverySite,
      organisationName: ''
    })

    expect(valid).toBe(false)
    expect(errors).toContainEqual(
      expect.objectContaining({
        keyword: 'minLength',
        instancePath: '/organisationName'
      })
    )
  })

  test('organisationName is accepted at its length limit and rejected at one more', () => {
    expect(
      validateAjv({ ...deliverySite, organisationName: 'A'.repeat(shortText) })
        .valid
    ).toBe(true)

    const { valid, errors } = validateAjv({
      ...deliverySite,
      organisationName: 'A'.repeat(shortText + 1)
    })
    expect(valid).toBe(false)
    expect(errors).toContainEqual(
      expect.objectContaining({
        keyword: 'maxLength',
        instancePath: '/organisationName',
        params: { limit: shortText }
      })
    )
  })

  test('rejects an additional property beyond the declared ones', () => {
    const payload = { ...deliverySite, extra: 'not allowed' }
    expect(validateAjv(payload).valid).toBe(false)
  })

  // address's own rules are covered by address.test.js — these only prove
  // the $ref is wired up for the postcodes the story names.
  test.each([[''], ['W$12 2GQ'], ['WS12']])(
    'rejects the postcode %j',
    (postcode) => {
      const payload = { ...deliverySite, address: { postcode } }
      const { valid, errors } = validateAjv(payload)

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ instancePath: '/address/postcode' })
      )
    }
  )

  test('rejects an address without a postcode', () => {
    const payload = {
      ...deliverySite,
      address: { fullAddress: '3 Receiver Road, Test City' }
    }
    const { valid, errors } = validateAjv(payload)

    expect(valid).toBe(false)
    expect(errors).toContainEqual(
      expect.objectContaining({
        keyword: 'required',
        instancePath: '/address',
        params: { missingProperty: 'postcode' }
      })
    )
  })

  describe('rpsNumbers', () => {
    test('accepts several RPS numbers', () => {
      const payload = { ...deliverySite, rpsNumbers: [1, 123, 456] }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test.each([
      [-343, 'minimum'],
      [0, 'minimum'],
      ['RPS123', 'type'],
      [1.5, 'type']
    ])(
      'rejects %j, which is not an integer greater than 0',
      (value, keyword) => {
        const { valid, errors } = validateAjv({
          ...deliverySite,
          rpsNumbers: [value]
        })

        expect(valid).toBe(false)
        expect(errors).toContainEqual(
          expect.objectContaining({ keyword, instancePath: '/rpsNumbers/0' })
        )
      }
    )

    // Optional means left out, so an empty list isn't "none".
    test('rejects an empty list', () => {
      const { valid, errors } = validateAjv({ ...deliverySite, rpsNumbers: [] })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'minItems',
          instancePath: '/rpsNumbers'
        })
      )
    })

    test('rejects a single number rather than a list', () => {
      const { valid, errors } = validateAjv({
        ...deliverySite,
        rpsNumbers: 123
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/rpsNumbers'
        })
      )
    })
  })
})
