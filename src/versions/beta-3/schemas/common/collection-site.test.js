import { collectionSite, validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor('common/collection-site.schema.json')

describe('collection-site schema', () => {
  const withoutField = (field) => {
    const { [field]: excluded, ...payload } = collectionSite
    return payload
  }

  test('accepts an address and contact details', () => {
    expect(validateAjv(collectionSite).valid).toBe(true)
  })

  test.each([['address'], ['contactDetails']])('%s is required', (field) => {
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

  test('rejects an additional property beyond the declared ones', () => {
    const payload = { ...collectionSite, extra: 'not allowed' }
    expect(validateAjv(payload).valid).toBe(false)
  })

  // address and contactDetails' own rules are covered by address.test.js and
  // contact-details.test.js — these only prove the $refs are wired up.
  test('rejects an invalid address', () => {
    const payload = {
      ...collectionSite,
      address: { postcode: 'not-a-postcode' }
    }
    const { valid, errors } = validateAjv(payload)

    expect(valid).toBe(false)
    expect(errors).toContainEqual(
      expect.objectContaining({ instancePath: '/address/postcode' })
    )
  })

  test('rejects invalid contact details', () => {
    const payload = { ...collectionSite, contactDetails: {} }
    const { valid, errors } = validateAjv(payload)

    expect(valid).toBe(false)
    expect(errors).toContainEqual(
      expect.objectContaining({ instancePath: '/contactDetails' })
    )
  })
})
