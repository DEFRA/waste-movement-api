import {
  collectionDateTime,
  collectionSite,
  apiCode,
  brokerOrDealerEntry,
  carrier,
  supportingReference,
  validatorFor,
  longText
} from '../test-helpers.js'

const validateAjv = validatorFor(
  'collection/record-collection-request.schema.json'
)

describe('record-collection-request schema', () => {
  const brokerOrDealer = { isPresent: true, items: [brokerOrDealerEntry] }
  const isDutyOfCareConfirmed = true
  const validCollection = {
    carrier,
    collectionDateTime,
    collectionSite,
    isDutyOfCareConfirmed
  }

  test('accepts a payload with a carrier and isDutyOfCareConfirmed', () => {
    expect(
      validateAjv({
        carrier,
        collectionDateTime,
        collectionSite,
        isDutyOfCareConfirmed
      }).valid
    ).toBe(true)
  })

  // apiCode is sent in the x-api-code header, not the body.
  test('rejects apiCode in the body', () => {
    expect(validateAjv({ apiCode, carrier }).valid).toBe(false)
  })

  test('rejects an additional property beyond the declared ones', () => {
    const payload = {
      carrier,
      collectionDateTime,
      collectionSite,
      isDutyOfCareConfirmed,
      extra: 'not allowed'
    }
    expect(validateAjv(payload).valid).toBe(false)
  })

  // carrier's own rules are covered by carrier.test.js — these confirm
  // it's required, that it's a single carrier rather than a list, and that the
  // $ref wiring is live.
  describe('carrier', () => {
    test('is required', () => {
      const { valid, errors } = validateAjv({})

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'carrier' }
        })
      )
    })

    test('accepts a valid carrier', () => {
      expect(
        validateAjv({
          carrier,
          collectionDateTime,
          collectionSite,
          isDutyOfCareConfirmed
        }).valid
      ).toBe(true)
    })

    test('rejects a list of carriers', () => {
      const { valid, errors } = validateAjv({
        carrier: [carrier],
        isDutyOfCareConfirmed
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'type', instancePath: '/carrier' })
      )
    })

    test('rejects a payload whose carrier is invalid', () => {
      const { organisationName, ...invalidCarrier } = carrier
      const { valid, errors } = validateAjv({
        carrier: invalidCarrier
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '/carrier',
          params: { missingProperty: 'organisationName' }
        })
      )
    })
  })

  describe('Feature: Declaring the duty of care confirmation when creating a collection', () => {
    describe('Scenario: A Collection is created when a carrier confirms duty of care', () => {
      test('validation passes when a duty of care confirmation is submitted', () => {
        expect(
          validateAjv({
            carrier,
            collectionDateTime,
            collectionSite,
            isDutyOfCareConfirmed
          }).valid
        ).toBe(true)
      })
    })

    describe("Scenario: A Collection isn't created when a carrier fails to submit a duty of care", () => {
      test('validation fails and the duty of care confirmation is reported as required', () => {
        const { valid, errors } = validateAjv({
          carrier,
          collectionDateTime,
          collectionSite
        })

        expect(valid).toBe(false)
        expect(errors).toContainEqual(
          expect.objectContaining({
            keyword: 'required',
            instancePath: '',
            params: { missingProperty: 'isDutyOfCareConfirmed' }
          })
        )
      })
    })

    describe('Additional coverage', () => {
      test('accepts a duty of care confirmation of false', () => {
        expect(
          validateAjv({
            carrier,
            collectionDateTime,
            collectionSite,
            isDutyOfCareConfirmed: false
          }).valid
        ).toBe(true)
      })

      test.each([['true'], [1], [null]])(
        'rejects a duty of care confirmation of %j, which is not a boolean',
        (value) => {
          const { valid, errors } = validateAjv({
            carrier,
            collectionDateTime,
            collectionSite,
            isDutyOfCareConfirmed: value
          })

          expect(valid).toBe(false)
          expect(errors).toContainEqual(
            expect.objectContaining({
              keyword: 'type',
              instancePath: '/isDutyOfCareConfirmed'
            })
          )
        }
      )
    })
  })

  // collectionSite's own rules are covered by collection-site.test.js — these
  // confirm it and collectionDateTime are required, and that the $ref wiring
  // is live.
  describe.each([['collectionDateTime'], ['collectionSite']])('%s', (field) => {
    test('is required', () => {
      const { [field]: excluded, ...payload } = validCollection
      const { valid, errors } = validateAjv(payload)

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: field }
        })
      )
    })
  })

  describe('collectionDateTime', () => {
    test.each([
      ['2026-01-15T09:30:00Z'],
      ['2026-01-15T09:30:00.123Z'],
      ['2026-01-15T09:30:00+01:00']
    ])('accepts the ISO 8601 date-time %j', (value) => {
      const payload = { ...validCollection, collectionDateTime: value }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test.each([
      ['2026-01-15'],
      ['09:30:00'],
      ['15/01/2026 09:30'],
      ['2026-01-15T09:30:00'],
      ['not-a-date'],
      ['']
    ])('rejects %j, which is not an ISO 8601 date-time', (value) => {
      const { valid, errors } = validateAjv({
        ...validCollection,
        collectionDateTime: value
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'format',
          instancePath: '/collectionDateTime'
        })
      )
    })

    test('rejects a value that is not a string', () => {
      const { valid, errors } = validateAjv({
        ...validCollection,
        collectionDateTime: 1768469400000
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/collectionDateTime'
        })
      )
    })
  })

  describe('collectionSite', () => {
    test('rejects a payload whose collectionSite is invalid', () => {
      const { address, ...invalidCollectionSite } = collectionSite
      const { valid, errors } = validateAjv({
        ...validCollection,
        collectionSite: invalidCollectionSite
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '/collectionSite',
          params: { missingProperty: 'address' }
        })
      )
    })
  })

  describe('brokerOrDealer', () => {
    test('is optional', () => {
      const payload = {
        carrier,
        collectionDateTime,
        collectionSite,
        supportingReferences: [supportingReference],
        isDutyOfCareConfirmed
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts a declared broker or dealer', () => {
      const payload = {
        carrier,
        collectionDateTime,
        collectionSite,
        brokerOrDealer,
        isDutyOfCareConfirmed
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    // The rules themselves live in broker-or-dealer.test.js; this only proves
    // the $ref is wired up, so a rejection propagates to the payload.
    test('rejects a payload whose broker or dealer is invalid', () => {
      const payload = {
        carrier,
        collectionDateTime,
        collectionSite,
        brokerOrDealer: { isPresent: false, items: brokerOrDealer.items },
        isDutyOfCareConfirmed
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })

  // supportingReferences' own rules are covered by
  // supporting-references.test.js — these confirm it's optional and that the
  // $ref wiring is live.
  describe('supportingReferences', () => {
    test('is optional', () => {
      const payload = {
        carrier,
        collectionDateTime,
        collectionSite,
        brokerOrDealer,
        isDutyOfCareConfirmed
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid supportingReferences', () => {
      const payload = {
        carrier,
        collectionDateTime,
        collectionSite,
        supportingReferences: [supportingReference],
        isDutyOfCareConfirmed
      }
      expect(validateAjv(payload).valid).toBe(true)
    })
  })

  // specialHandlingRequirements' own rules are covered by
  // special-handling-requirements.test.js — these confirm it's optional and
  // that the $ref wiring is live.
  describe('specialHandlingRequirements', () => {
    test('is optional', () => {
      const payload = {
        carrier,
        collectionDateTime,
        collectionSite,
        brokerOrDealer,
        isDutyOfCareConfirmed
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid specialHandlingRequirements', () => {
      const payload = {
        carrier,
        collectionDateTime,
        collectionSite,
        specialHandlingRequirements: 'Handle with care and keep upright.',
        isDutyOfCareConfirmed
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects a payload whose specialHandlingRequirements is invalid', () => {
      const payload = {
        carrier,
        collectionDateTime,
        collectionSite,
        specialHandlingRequirements: 'A'.repeat(longText + 1)
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })
})
