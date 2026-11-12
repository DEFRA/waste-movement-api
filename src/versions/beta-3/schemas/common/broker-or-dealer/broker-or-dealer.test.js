import {
  brokerOrDealerEntry as brokerOrDealer,
  validatorFor,
  shortText,
  longText
} from '../../test-helpers.js'

const validateAjv = validatorFor(
  'common/broker-or-dealer/broker-or-dealer.schema.json'
)

describe('Feature: Declaring any brokers or dealers involved when creating a waste movement', () => {
  const involving = (...items) => ({ isPresent: true, items })

  const withoutField = (field) => {
    const { [field]: excluded, ...payload } = brokerOrDealer
    return payload
  }

  describe('Scenario: A Movement is created when no broker or dealer is involved', () => {
    test('the Movement is created when no broker or dealer details are submitted', () => {
      expect(validateAjv({}).valid).toBe(true)
    })

    test('the Movement is created when involvement is explicitly declared as false', () => {
      expect(validateAjv({ isPresent: false }).valid).toBe(true)
    })
  })

  describe('Scenario: A Movement is created when a broker or dealer and all its valid details are declared', () => {
    test('the Movement is created when organisation name, registration number, contact details and address are valid', () => {
      expect(validateAjv(involving(brokerOrDealer)).valid).toBe(true)
    })
  })

  describe('Scenario: A Movement is created when more than one broker or dealer is declared', () => {
    test('the Movement is created when valid details are given for each broker or dealer', () => {
      const second = {
        ...brokerOrDealer,
        organisationName: 'Second Broker Ltd',
        registrationNumber: 'ROC UT 9999'
      }

      expect(validateAjv(involving(brokerOrDealer, second)).valid).toBe(true)
    })
  })

  describe('Scenario: A Movement is created when a broker or dealer is declared without an address', () => {
    test('the Movement is created when no address is submitted', () => {
      expect(validateAjv(involving(withoutField('address'))).valid).toBe(true)
    })
  })

  describe("Scenario: A Movement isn't created when a broker or dealer is declared without an organisation name", () => {
    test('the Movement is rejected when no organisation name is submitted', () => {
      expect(
        validateAjv(involving(withoutField('organisationName'))).valid
      ).toBe(false)
    })
  })

  describe("Scenario: A Movement isn't created when a broker or dealer is declared without a registration number and without a reason for no registration number", () => {
    test('the Movement is rejected when neither is submitted', () => {
      expect(
        validateAjv(involving(withoutField('registrationNumber'))).valid
      ).toBe(false)
    })
  })

  describe('Scenario: A Movement is created when a broker or dealer is declared without a registration number but with a reason for no registration number', () => {
    test('the Movement is created when a reason is submitted in its place', () => {
      const payload = involving({
        ...withoutField('registrationNumber'),
        reasonForNoRegistrationNumber: 'ONE_OFF'
      })

      expect(validateAjv(payload).valid).toBe(true)
    })
  })

  describe("Scenario: A Movement isn't created when a broker or dealer is declared with both a registration number and a reason for no registration number", () => {
    test('the Movement is rejected when both are submitted', () => {
      const payload = involving({
        ...brokerOrDealer,
        reasonForNoRegistrationNumber: 'ONE_OFF'
      })

      expect(validateAjv(payload).valid).toBe(false)
    })
  })

  describe("Scenario: A Movement isn't created when a broker or dealer's registration number is invalid", () => {
    test("the Movement is rejected when the registration number isn't a valid carrier registration number format", () => {
      const payload = involving({
        ...brokerOrDealer,
        registrationNumber: 'NOT-A-REGISTRATION'
      })

      expect(validateAjv(payload).valid).toBe(false)
    })
  })

  describe("Scenario: A Movement isn't created when a broker or dealer is declared without an email address or a phone number", () => {
    test('the Movement is rejected when neither is submitted', () => {
      const payload = involving({ ...brokerOrDealer, contactDetails: {} })

      expect(validateAjv(payload).valid).toBe(false)
    })

    test('the Movement is rejected when contact details are omitted entirely', () => {
      expect(validateAjv(involving(withoutField('contactDetails'))).valid).toBe(
        false
      )
    })
  })

  describe("Scenario: A Movement isn't created when a broker or dealer's email address is invalid", () => {
    test("the Movement is rejected when the email address isn't valid", () => {
      const payload = involving({
        ...brokerOrDealer,
        contactDetails: { emailAddress: 'not-an-email-address' }
      })

      expect(validateAjv(payload).valid).toBe(false)
    })
  })

  describe("Scenario: A Movement isn't created when a broker or dealer's phone number is invalid", () => {
    test("the Movement is rejected when the phone number isn't valid", () => {
      const payload = involving({
        ...brokerOrDealer,
        contactDetails: { phoneNumber: 'not-a-phone-number' }
      })

      expect(validateAjv(payload).valid).toBe(false)
    })
  })

  describe("Scenario: A Movement isn't created when a broker or dealer's address has an invalid postcode", () => {
    test("the Movement is rejected when the postcode isn't a valid UK postcode or Irish Eircode", () => {
      const payload = involving({
        ...brokerOrDealer,
        address: { fullAddress: '2 Broker Yard, Test City', postcode: 'ZZ' }
      })

      expect(validateAjv(payload).valid).toBe(false)
    })
  })

  describe("Scenario: A Movement isn't created when a broker or dealer is declared as involved but no broker or dealer details are given", () => {
    test('the Movement is rejected when involvement is declared with no items', () => {
      expect(validateAjv({ isPresent: true }).valid).toBe(false)
    })

    test('the Movement is rejected when involvement is declared with an empty items array', () => {
      expect(validateAjv({ isPresent: true, items: [] }).valid).toBe(false)
    })
  })

  describe("Scenario: A Movement isn't created when no broker or dealer is involved but broker or dealer details are given", () => {
    test('the Movement is rejected when involvement is declared as false but details are submitted', () => {
      const payload = { isPresent: false, items: [brokerOrDealer] }

      expect(validateAjv(payload).valid).toBe(false)
    })

    test('the Movement is rejected when details are submitted without declaring involvement', () => {
      expect(validateAjv({ items: [brokerOrDealer] }).valid).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // Additional coverage — not called out by the feature file.
  // -------------------------------------------------------------------------
  describe('Additional coverage', () => {
    test.each([
      ['England/NRW upper tier', 'CBDU654321'],
      ['England/NRW lower tier', 'CBDL600'],
      ['lower case', 'cbdu123456'],
      ['SEPA current format', 'WCR/R/1234567'],
      ['SEPA previous format', 'SCO/123456'],
      ['SEPA PCT format', 'PCT-A-123'],
      ['SEPA PCT format at full length', 'pct-a-1234567'],
      ['NI spaced', 'ROC UT 9999'],
      ['NI unspaced', 'ROCLT9999'],
      ['surrounding whitespace', '  CBDU654321  ']
    ])('accepts a %s registration number', (_label, registrationNumber) => {
      const payload = involving({ ...brokerOrDealer, registrationNumber })

      expect(validateAjv(payload).valid).toBe(true)
    })

    test.each([
      ['an unknown tier letter', 'CBDX123456'],
      ['too few digits', 'CBDL6'],
      ['a SEPA code with too few digits', 'SCO/12345'],
      ['a PCT code with too few digits', 'PCT-A-12'],
      ['a PCT code with two letters', 'PCT-AA-123'],
      ['an empty string', '']
    ])('rejects %s', (_label, registrationNumber) => {
      const payload = involving({ ...brokerOrDealer, registrationNumber })

      expect(validateAjv(payload).valid).toBe(false)
    })

    test('rejects an empty reasonForNoRegistrationNumber', () => {
      const payload = involving({
        ...withoutField('registrationNumber'),
        reasonForNoRegistrationNumber: ''
      })

      expect(validateAjv(payload).valid).toBe(false)
    })

    test('rejects an unknown field on a broker or dealer', () => {
      const payload = involving({ ...brokerOrDealer, nickname: 'Brokey' })

      expect(validateAjv(payload).valid).toBe(false)
    })

    test('rejects an unknown field alongside isPresent', () => {
      expect(validateAjv({ isPresent: false, unexpected: true }).valid).toBe(
        false
      )
    })

    test('accepts contact details with only an email address', () => {
      const payload = involving({
        ...brokerOrDealer,
        contactDetails: { emailAddress: 'broker@example.com' }
      })

      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts contact details with only a phone number', () => {
      const payload = involving({
        ...brokerOrDealer,
        contactDetails: { phoneNumber: '01112223333' }
      })

      expect(validateAjv(payload).valid).toBe(true)
    })
  })

  describe('Scenario: Free text longer than its length limit is rejected', () => {
    test.each([
      ['organisationName', shortText, brokerOrDealer],
      [
        'reasonForNoRegistrationNumber',
        longText,
        withoutField('registrationNumber')
      ]
    ])(
      '%s is accepted at %i characters and rejected at one more',
      (field, limit, base) => {
        expect(
          validateAjv(involving({ ...base, [field]: 'A'.repeat(limit) })).valid
        ).toBe(true)

        const { valid, errors } = validateAjv(
          involving({ ...base, [field]: 'A'.repeat(limit + 1) })
        )
        expect(valid).toBe(false)
        expect(errors).toContainEqual(
          expect.objectContaining({
            keyword: 'maxLength',
            instancePath: `/items/0/${field}`,
            params: { limit }
          })
        )
      }
    )
  })
})
