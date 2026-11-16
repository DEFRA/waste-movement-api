import { carrier, validatorFor, shortText } from '../test-helpers.js'

const validateAjv = validatorFor('common/carrier.schema.json')

describe('Feature: Schema - declaring a carrier of the waste', () => {
  const withoutField = (field, from = carrier) => {
    const { [field]: excluded, ...payload } = from
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

  describe('Scenario: Validation passes when an intended carrier and all its valid details are declared', () => {
    test('validation passes when organisation name, registration number, means of transport, contact details and address are valid', () => {
      expect(validateAjv(carrier).valid).toBe(true)
    })
  })

  describe('Scenario: Validation passes when an intended carrier is declared without an address', () => {
    test('validation passes when no address is submitted', () => {
      expect(validateAjv(withoutField('address')).valid).toBe(true)
    })
  })

  describe('Scenario: Validation fails when an intended carrier is declared without an organisation name', () => {
    test('validation fails and an organisation name is reported as required', () => {
      const { valid, errors } = validateAjv(withoutField('organisationName'))

      expect(valid).toBe(false)
      expect(errors).toContainEqual(missing('organisationName'))
    })
  })

  describe('Scenario: Validation fails when an intended carrier is declared without a means of transport', () => {
    test('validation fails and a means of transport is reported as required', () => {
      const { valid, errors } = validateAjv(
        withoutField('meansOfTransport', withoutField('vehicleRegistration'))
      )

      expect(valid).toBe(false)
      expect(errors).toContainEqual(missing('meansOfTransport'))
    })
  })

  describe('Scenario: Validation fails when an intended carrier is declared without a registration number and without a reason for no registration number', () => {
    test('validation fails and a reason for no registration number is reported as required', () => {
      const { valid, errors } = validateAjv(withoutField('registrationNumber'))

      expect(valid).toBe(false)
      expect(errors).toContainEqual(missing('reasonForNoRegistrationNumber'))
    })
  })

  describe('Scenario: Validation passes when an intended carrier is declared without a registration number but with a reason for no registration number', () => {
    test('validation passes when a reason is submitted in its place', () => {
      const payload = {
        ...withoutField('registrationNumber'),
        reasonForNoRegistrationNumber: 'ONE_OFF'
      }

      expect(validateAjv(payload).valid).toBe(true)
    })
  })

  describe('Scenario: Validation fails when an intended carrier is declared with both a registration number and a reason for no registration number', () => {
    test('validation fails and the reason is reported as not allowed alongside a registration number', () => {
      const { valid, errors } = validateAjv({
        ...carrier,
        reasonForNoRegistrationNumber: 'ONE_OFF'
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        invalid('not', '/reasonForNoRegistrationNumber')
      )
    })
  })

  describe("Scenario: Validation fails when an intended carrier's registration number is invalid", () => {
    test("validation fails when the registration number isn't a valid carrier registration number format", () => {
      const { valid, errors } = validateAjv({
        ...carrier,
        registrationNumber: 'NOT-A-REGISTRATION'
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(invalid('pattern', '/registrationNumber'))
    })
  })

  describe('Scenario: Validation passes when an intended carrier transporting by road is declared with a vehicle registration', () => {
    test('validation passes when a vehicle registration is submitted', () => {
      expect(
        validateAjv({
          ...carrier,
          meansOfTransport: 'ROAD',
          vehicleRegistration: 'AB12 CDE'
        }).valid
      ).toBe(true)
    })
  })

  describe('Scenario: Validation fails when an intended carrier transporting by road is declared without a vehicle registration', () => {
    test('validation fails and a vehicle registration is reported as required', () => {
      const { valid, errors } = validateAjv(withoutField('vehicleRegistration'))

      expect(valid).toBe(false)
      expect(errors).toContainEqual(missing('vehicleRegistration'))
    })
  })

  describe('Scenario: Validation passes when an intended carrier transporting by other means is declared with a description of the means of transport', () => {
    test('validation passes when a description of the means of transport is submitted', () => {
      const payload = {
        ...withoutField('vehicleRegistration'),
        meansOfTransport: 'OTHER',
        otherMeansOfTransport: 'Horse and cart'
      }

      expect(validateAjv(payload).valid).toBe(true)
    })
  })

  describe('Scenario: Validation fails when an intended carrier transporting by other means is declared without a description of the means of transport', () => {
    test('validation fails and a description of the means of transport is reported as required', () => {
      const { valid, errors } = validateAjv({
        ...withoutField('vehicleRegistration'),
        meansOfTransport: 'OTHER'
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(missing('otherMeansOfTransport'))
    })
  })

  describe('Scenario: Validation fails when an intended carrier is declared without an email address or a phone number', () => {
    test('validation fails when contact details has neither', () => {
      const { valid, errors } = validateAjv({ ...carrier, contactDetails: {} })

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

  describe("Scenario: Validation fails when an intended carrier's email address is invalid", () => {
    test("validation fails when the email address isn't valid", () => {
      const { valid, errors } = validateAjv({
        ...carrier,
        contactDetails: { emailAddress: 'not-an-email-address' }
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        invalid('format', '/contactDetails/emailAddress')
      )
    })
  })

  describe("Scenario: Validation fails when an intended carrier's phone number is invalid", () => {
    test("validation fails when the phone number isn't valid", () => {
      const { valid, errors } = validateAjv({
        ...carrier,
        contactDetails: { phoneNumber: 'not-a-number' }
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        invalid('pattern', '/contactDetails/phoneNumber')
      )
    })
  })

  describe("Scenario: Validation fails when an intended carrier's address has an invalid postcode", () => {
    test("validation fails when the postcode isn't a valid UK postcode or Irish Eircode", () => {
      const { valid, errors } = validateAjv({
        ...carrier,
        address: { ...carrier.address, postcode: 'NOTAPOSTCODE' }
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(invalid('pattern', '/address/postcode'))
    })
  })

  describe('Additional coverage', () => {
    test.each([
      [
        'a vehicle registration when transporting by rail',
        { ...carrier, meansOfTransport: 'RAIL' },
        '/vehicleRegistration'
      ],
      [
        'a vehicle registration when transporting by other means',
        {
          ...carrier,
          meansOfTransport: 'OTHER',
          otherMeansOfTransport: 'Horse and cart'
        },
        '/vehicleRegistration'
      ],
      [
        'a description of the means of transport when transporting by road',
        { ...carrier, otherMeansOfTransport: 'Horse and cart' },
        '/otherMeansOfTransport'
      ]
    ])('rejects %s', (_label, payload, instancePath) => {
      const { valid, errors } = validateAjv(payload)

      expect(valid).toBe(false)
      expect(errors).toContainEqual(invalid('not', instancePath))
    })

    test('rejects a reason for no registration number that is not in the list', () => {
      const { valid, errors } = validateAjv({
        ...withoutField('registrationNumber'),
        reasonForNoRegistrationNumber: 'Carrier is exempt'
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        invalid('enum', '/reasonForNoRegistrationNumber')
      )
    })

    test('rejects a means of transport that is not in the list', () => {
      const { valid, errors } = validateAjv({
        ...withoutField('vehicleRegistration'),
        meansOfTransport: 'Bicycle'
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(invalid('enum', '/meansOfTransport'))
    })

    test('rejects an unknown field on a carrier', () => {
      expect(validateAjv({ ...carrier, nickname: 'Carry' }).valid).toBe(false)
    })
  })

  describe('Scenario: Free text longer than its length limit is rejected', () => {
    test.each([
      ['organisationName', shortText, carrier],
      ['vehicleRegistration', shortText, carrier],
      [
        'otherMeansOfTransport',
        shortText,
        { ...withoutField('vehicleRegistration'), meansOfTransport: 'OTHER' }
      ]
    ])(
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
