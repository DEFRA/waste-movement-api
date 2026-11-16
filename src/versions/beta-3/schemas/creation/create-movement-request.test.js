import {
  collectionDateTime,
  collectionSite,
  apiCode,
  brokerOrDealerEntry,
  carrier,
  commercialProducer,
  hazardousWasteItem,
  householdProducer,
  municipalProducer,
  receiver,
  supportingReference,
  treatment,
  validatorFor,
  wasteItem,
  longText
} from '../test-helpers.js'

const validateAjv = validatorFor('creation/create-movement-request.schema.json')

const intendedCarriers = [carrier]
const intendedReceivers = [receiver]
const wasteItems = [wasteItem]
const validMovement = {
  producer: householdProducer,
  collectionDateTime,
  collectionSite,
  intendedCarriers,
  intendedReceivers,
  wasteItems
}

describe('create-movement-request schema', () => {
  // apiCode is sent in the x-api-code header, not the body.
  test('rejects apiCode in the body', () => {
    const payload = {
      apiCode,
      producer: householdProducer,
      collectionDateTime,
      collectionSite,
      intendedCarriers,
      intendedReceivers,
      wasteItems
    }
    expect(validateAjv(payload).valid).toBe(false)
  })

  test('producer is required', () => {
    const payload = {
      collectionDateTime,
      collectionSite,
      intendedCarriers,
      intendedReceivers,
      wasteItems
    }
    expect(validateAjv(payload).valid).toBe(false)
  })

  test.each([
    ['HOUSEHOLD', householdProducer],
    ['COMMERCIAL', commercialProducer],
    ['MUNICIPAL', municipalProducer]
  ])('accepts a valid %s producer', (_wasteSource, producer) => {
    const payload = {
      producer,
      collectionDateTime,
      collectionSite,
      intendedCarriers,
      intendedReceivers,
      wasteItems
    }
    expect(validateAjv(payload).valid).toBe(true)
  })

  test('rejects an additional property beyond the declared ones', () => {
    const payload = {
      producer: householdProducer,
      collectionDateTime,
      collectionSite,
      intendedCarriers,
      intendedReceivers,
      wasteItems,
      extra: 'not allowed'
    }
    expect(validateAjv(payload).valid).toBe(false)
  })

  // A single carrier's rules are covered by carrier.test.js — these
  // cover the list itself and confirm each entry is checked against
  // carrier.schema.json.
  describe('intendedCarriers', () => {
    // Scenario: A Movement isn't created when no intended carrier is declared.
    test('is required', () => {
      const { valid, errors } = validateAjv({
        producer: householdProducer
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'intendedCarriers' }
        })
      )
    })

    test('rejects an empty list of carriers', () => {
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers: []
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'minItems',
          instancePath: '/intendedCarriers'
        })
      )
    })

    test('rejects a single carrier rather than a list', () => {
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        intendedCarriers: carrier
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/intendedCarriers'
        })
      )
    })

    test('accepts one carrier', () => {
      const payload = {
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers,
        intendedReceivers,
        wasteItems
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts more than one carrier', () => {
      const payload = {
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers: [
          carrier,
          { ...carrier, organisationName: 'Second Carrier Ltd' }
        ],
        intendedReceivers,
        wasteItems
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects a payload whose carrier is invalid', () => {
      const { organisationName, ...invalidCarrier } = carrier
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers: [invalidCarrier]
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '/intendedCarriers/0',
          params: { missingProperty: 'organisationName' }
        })
      )
    })

    test('rejects the list when any one carrier is invalid, reporting the error against that carrier', () => {
      const { organisationName, ...invalidSecond } = carrier
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers: [carrier, invalidSecond]
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '/intendedCarriers/1',
          params: { missingProperty: 'organisationName' }
        })
      )
      expect(
        errors.filter(({ instancePath }) =>
          instancePath.startsWith('/intendedCarriers/0')
        )
      ).toEqual([])
    })
  })

  // A single receiver's rules are covered by receiver/receiver.test.js — these
  // cover the list itself and confirm each entry is checked against
  // receiver.schema.json.
  describe('intendedReceivers', () => {
    test('is required', () => {
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        intendedCarriers
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'intendedReceivers' }
        })
      )
    })

    test('rejects an empty list of receivers', () => {
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers,
        intendedReceivers: [],
        wasteItems
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'minItems',
          instancePath: '/intendedReceivers'
        })
      )
    })

    test('rejects a single receiver rather than a list', () => {
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers,
        intendedReceivers: receiver,
        wasteItems
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/intendedReceivers'
        })
      )
    })

    test('accepts one receiver', () => {
      const payload = {
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers,
        intendedReceivers,
        wasteItems
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts more than one receiver', () => {
      const payload = {
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers,
        intendedReceivers: [
          receiver,
          {
            ...receiver,
            siteName: 'Second Receiver Site',
            authorisationNumber: 'XX9999XX'
          }
        ],
        wasteItems
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects the list when any one receiver is invalid, reporting each error against that receiver', () => {
      const { siteName, ...invalidSecond } = {
        ...receiver,
        receiptAddress: { ...receiver.receiptAddress, postcode: 'NOTAPOSTCODE' }
      }
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers,
        intendedReceivers: [receiver, invalidSecond],
        wasteItems
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '/intendedReceivers/1',
          params: { missingProperty: 'siteName' }
        })
      )
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'pattern',
          instancePath: '/intendedReceivers/1/receiptAddress/postcode'
        })
      )
      expect(
        errors.filter(({ instancePath }) =>
          instancePath.startsWith('/intendedReceivers/0')
        )
      ).toEqual([])
    })
  })

  // A waste item's rules are covered by waste-item/*.test.js — these confirm
  // wasteItems is required and that the $ref wiring is live.
  describe('wasteItems', () => {
    // Scenario: A Movement is created when a valid physical form, containers
    // and weight are declared.
    test('accepts a valid waste item', () => {
      const payload = {
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers,
        intendedReceivers,
        wasteItems
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('is required', () => {
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers,
        intendedReceivers
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'wasteItems' }
        })
      )
    })

    test('rejects an empty list of waste items', () => {
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers,
        intendedReceivers,
        wasteItems: []
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'minItems',
          instancePath: '/wasteItems'
        })
      )
    })

    test('rejects a payload whose waste item is invalid, reporting the error against that item', () => {
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers,
        intendedReceivers,
        wasteItems: [
          {
            physicalDetails: { ...wasteItem.physicalDetails, form: 'Plasma' }
          }
        ]
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'enum',
          instancePath: '/wasteItems/0/physicalDetails/form'
        })
      )
    })

    // waste-item.schema.json allows treatments, but creating a movement
    // doesn't take them yet: this schema forbids them on each waste item.
    test('rejects treatments on a waste item', () => {
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers,
        intendedReceivers,
        wasteItems: [{ ...wasteItem, treatments: [treatment] }]
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'not',
          instancePath: '/wasteItems/0/treatments'
        })
      )
    })
  })

  // When hazardous waste needs a consignment note is checked by
  // common/helpers/waste-reference-data-checks.js, not this schema — its business
  // scenarios are in routes/create-movement.test.js. The note's own
  // rules are in consignment-note.test.js; these confirm the $ref is live.
  describe('consignmentNote', () => {
    test('is optional', () => {
      const payload = {
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers,
        intendedReceivers,
        wasteItems: [hazardousWasteItem]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects a payload whose consignment note is invalid', () => {
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers,
        intendedReceivers,
        wasteItems,
        consignmentNote: { code: 'INVALID_FORMAT' }
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'pattern',
          instancePath: '/consignmentNote/code'
        })
      )
    })
  })

  describe('brokerOrDealer', () => {
    const brokerOrDealer = { isPresent: true, items: [brokerOrDealerEntry] }

    test('is optional', () => {
      const payload = {
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers,
        intendedReceivers,
        wasteItems
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts a declared broker or dealer', () => {
      const payload = {
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers,
        intendedReceivers,
        wasteItems,
        brokerOrDealer
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    // The rules themselves live in broker-or-dealer.test.js; this only proves
    // the $ref is wired up, so a rejection propagates to the payload.
    test('rejects a payload whose broker or dealer is invalid', () => {
      const payload = {
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers,
        intendedReceivers,
        wasteItems,
        brokerOrDealer: { isPresent: false, items: brokerOrDealer.items }
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })

  // collectionSite's own rules are covered by collection-site.test.js — these
  // confirm it and collectionDateTime are required, and that the $ref wiring
  // is live.
  describe.each([['collectionDateTime'], ['collectionSite']])('%s', (field) => {
    test('is required', () => {
      const { [field]: excluded, ...payload } = validMovement
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
      const payload = { ...validMovement, collectionDateTime: value }
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
        ...validMovement,
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
        ...validMovement,
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
        ...validMovement,
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

  // supportingReferences' own rules are covered by
  // supporting-references.test.js — these confirm it's optional and that the
  // $ref wiring is live.
  describe('supportingReferences', () => {
    test('is optional', () => {
      const payload = {
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers,
        intendedReceivers,
        wasteItems
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid supportingReferences', () => {
      const payload = {
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers,
        intendedReceivers,
        wasteItems,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })
  })

  // specialHandlingRequirements' own rules are covered by
  // special-handling-requirements.test.js — these confirm it's optional and
  // that the $ref wiring is live.
  describe('specialHandlingRequirements', () => {
    // Scenario: A Movement is successfully created without special handling
    // requirements.
    test('is optional', () => {
      const payload = {
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers,
        intendedReceivers,
        wasteItems
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid specialHandlingRequirements', () => {
      const payload = {
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers,
        intendedReceivers,
        wasteItems,
        specialHandlingRequirements: 'Handle with care and keep upright.'
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects a payload whose specialHandlingRequirements is invalid', () => {
      const payload = {
        producer: householdProducer,
        collectionDateTime,
        collectionSite,
        intendedCarriers,
        intendedReceivers,
        wasteItems,
        specialHandlingRequirements: 'A'.repeat(longText + 1)
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })
})
