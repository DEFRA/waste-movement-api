import {
  contactDetails as validContactDetails,
  emailAddressMaxLength,
  validatorFor
} from '../test-helpers.js'

const validateAjv = validatorFor('common/contact-details.schema.json')

describe('contact-details schema', () => {
  test('accepts emailAddress and phoneNumber together', () => {
    expect(validateAjv(validContactDetails).valid).toBe(true)
  })

  test('accepts emailAddress only', () => {
    const { phoneNumber, ...payload } = validContactDetails
    expect(validateAjv(payload).valid).toBe(true)
  })

  test('accepts phoneNumber only', () => {
    const { emailAddress, ...payload } = validContactDetails
    expect(validateAjv(payload).valid).toBe(true)
  })

  test('rejects an empty object (neither emailAddress nor phoneNumber)', () => {
    const { valid, errors } = validateAjv({})

    expect(valid).toBe(false)
    expect(errors).toContainEqual(
      expect.objectContaining({
        keyword: 'required',
        params: { missingProperty: 'phoneNumber' }
      })
    )
  })

  // An anyOf of two requireds would report both as missing, which reads as
  // "both are required". The if/else reports only phoneNumber.
  test('reports only phoneNumber as missing when neither is provided', () => {
    const { errors } = validateAjv({})

    expect(errors).not.toContainEqual(
      expect.objectContaining({
        keyword: 'required',
        params: { missingProperty: 'emailAddress' }
      })
    )
  })

  test('rejects a malformed emailAddress', () => {
    const payload = { emailAddress: 'not-an-email' }
    expect(validateAjv(payload).valid).toBe(false)
  })

  test('rejects a malformed phoneNumber', () => {
    const payload = { phoneNumber: 'not-a-number' }
    expect(validateAjv(payload).valid).toBe(false)
  })

  test('rejects a phoneNumber with too few digits', () => {
    const payload = { phoneNumber: '123456' }
    expect(validateAjv(payload).valid).toBe(false)
  })

  test('rejects contact details with an extra property', () => {
    const payload = { ...validContactDetails, extra: true }
    expect(validateAjv(payload).valid).toBe(false)
  })

  describe('Scenario: An email address longer than its length limit is rejected', () => {
    const domain = '@example.com'
    const emailAddressOf = (length) =>
      'a'.repeat(length - domain.length) + domain

    test('accepts an email address of the maximum length', () => {
      const payload = { emailAddress: emailAddressOf(emailAddressMaxLength) }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects an email address one character longer', () => {
      const payload = {
        emailAddress: emailAddressOf(emailAddressMaxLength + 1)
      }
      const { valid, errors } = validateAjv(payload)

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'maxLength',
          instancePath: '/emailAddress',
          params: { limit: emailAddressMaxLength }
        })
      )
    })
  })
})
