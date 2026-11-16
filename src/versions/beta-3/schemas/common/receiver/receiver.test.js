import { receiver, validatorFor, shortText } from '../../test-helpers.js'

const validateAjv = validatorFor('common/receiver/receiver.schema.json')

describe('Feature: Schema - declaring a receiver of the waste', () => {
  const withoutField = (field) => {
    const { [field]: excluded, ...payload } = receiver
    return payload
  }

  const missing = (missingProperty) =>
    expect.objectContaining({
      keyword: 'required',
      instancePath: '',
      params: { missingProperty }
    })

  const invalid = (keyword, instancePath) =>
    expect.objectContaining({ keyword, instancePath })

  describe('Scenario: Validation passes when an intended receiver and all its valid details are declared', () => {
    test('validation passes when site name, authorisation number, receipt address and contact details are valid', () => {
      expect(validateAjv(receiver).valid).toBe(true)
    })
  })

  describe('Scenario: Validation passes when an intended receiver is declared with only an email address or only a phone number', () => {
    test('validation passes with an email address and no phone number', () => {
      const payload = {
        ...receiver,
        contactDetails: { emailAddress: 'receiver@example.com' }
      }

      expect(validateAjv(payload).valid).toBe(true)
    })

    test('validation passes with a phone number and no email address', () => {
      const payload = {
        ...receiver,
        contactDetails: { phoneNumber: '01234567890' }
      }

      expect(validateAjv(payload).valid).toBe(true)
    })
  })

  describe('Scenario: Validation fails when an intended receiver is declared without a site name', () => {
    test('validation fails and a site name is reported as required', () => {
      const { valid, errors } = validateAjv(withoutField('siteName'))

      expect(valid).toBe(false)
      expect(errors).toContainEqual(missing('siteName'))
    })
  })

  describe('Scenario: Validation fails when an intended receiver is declared without an authorisation number', () => {
    test('validation fails and an authorisation number is reported as required', () => {
      const { valid, errors } = validateAjv(withoutField('authorisationNumber'))

      expect(valid).toBe(false)
      expect(errors).toContainEqual(missing('authorisationNumber'))
    })
  })

  describe('Scenario: Validation fails when an intended receiver is declared without a receipt address', () => {
    test('validation fails and a receipt address is reported as required', () => {
      const { valid, errors } = validateAjv(withoutField('receiptAddress'))

      expect(valid).toBe(false)
      expect(errors).toContainEqual(missing('receiptAddress'))
    })
  })

  describe('Scenario: Validation fails when an intended receiver is declared without an email address or a phone number', () => {
    test('validation fails when contact details has neither', () => {
      const { valid, errors } = validateAjv({ ...receiver, contactDetails: {} })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '/contactDetails',
          params: { missingProperty: 'phoneNumber' }
        })
      )
    })

    test('validation fails when contact details are omitted entirely', () => {
      const { valid, errors } = validateAjv(withoutField('contactDetails'))

      expect(valid).toBe(false)
      expect(errors).toContainEqual(missing('contactDetails'))
    })
  })

  describe("Scenario: Validation fails when an intended receiver's authorisation number is invalid", () => {
    test("validation fails when the authorisation number isn't a valid format", () => {
      const { valid, errors } = validateAjv({
        ...receiver,
        authorisationNumber: 'NOT-A-PERMIT'
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(invalid('pattern', '/authorisationNumber'))
    })
  })

  describe("Scenario: Validation fails when an intended receiver's receipt address has an invalid postcode", () => {
    test("validation fails when the postcode isn't a valid UK postcode or Irish Eircode", () => {
      const { valid, errors } = validateAjv({
        ...receiver,
        receiptAddress: { ...receiver.receiptAddress, postcode: 'NOTAPOSTCODE' }
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        invalid('pattern', '/receiptAddress/postcode')
      )
    })
  })

  describe("Scenario: Validation fails when an intended receiver's email address is invalid", () => {
    test("validation fails when the email address isn't valid", () => {
      const { valid, errors } = validateAjv({
        ...receiver,
        contactDetails: { emailAddress: 'not-an-email-address' }
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        invalid('format', '/contactDetails/emailAddress')
      )
    })
  })

  describe("Scenario: Validation fails when an intended receiver's phone number is invalid", () => {
    test("validation fails when the phone number isn't valid", () => {
      const { valid, errors } = validateAjv({
        ...receiver,
        contactDetails: { phoneNumber: 'not-a-number' }
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        invalid('pattern', '/contactDetails/phoneNumber')
      )
    })
  })

  describe('Additional coverage', () => {
    test('rejects an empty site name', () => {
      expect(validateAjv({ ...receiver, siteName: '' }).valid).toBe(false)
    })

    test('rejects an unknown field on a receiver', () => {
      expect(validateAjv({ ...receiver, nickname: 'Recky' }).valid).toBe(false)
    })
  })

  describe('Scenario: Free text longer than its length limit is rejected', () => {
    test.each([['siteName', shortText, receiver]])(
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
