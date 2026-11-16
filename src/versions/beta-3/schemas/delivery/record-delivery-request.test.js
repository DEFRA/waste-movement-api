import {
  apiCode,
  supportingReference,
  carrier,
  deliveryDateTime,
  deliverySite,
  validatorFor
} from '../test-helpers.js'

const validateAjv = validatorFor('delivery/record-delivery-request.schema.json')

describe('record-delivery-request schema', () => {
  const movementIds = ['25HRA0B2']
  const deliveryDetails = { carrier, deliveryDateTime, deliverySite }

  test('accepts a valid payload', () => {
    expect(validateAjv({ movementIds, ...deliveryDetails }).valid).toBe(true)
  })

  test('accepts multiple movementIds', () => {
    expect(
      validateAjv({ movementIds: ['25HRA0B2', '25HRA0B3'], ...deliveryDetails })
        .valid
    ).toBe(true)
  })

  // apiCode is sent in the x-api-code header, not the body.
  test('rejects apiCode in the body', () => {
    expect(
      validateAjv({ apiCode, movementIds, ...deliveryDetails }).valid
    ).toBe(false)
  })

  test('movementIds is required', () => {
    expect(validateAjv({ ...deliveryDetails }).valid).toBe(false)
  })

  test('rejects an empty movementIds list', () => {
    expect(validateAjv({ movementIds: [], ...deliveryDetails }).valid).toBe(
      false
    )
  })

  // Each movementId's own rules are covered by movement-id.test.js — these
  // confirm the $ref wiring is live.
  test('rejects an empty movementId', () => {
    expect(validateAjv({ movementIds: [''] }).valid).toBe(false)
  })

  test('rejects a movementId not in the ID format', () => {
    expect(validateAjv({ movementIds: ['NONEXISTENT'] }).valid).toBe(false)
  })

  test('rejects an additional property beyond the declared ones', () => {
    expect(
      validateAjv({ movementIds, ...deliveryDetails, extra: 'not allowed' })
        .valid
    ).toBe(false)
  })

  // supportingReferences' own rules are covered by
  // supporting-references.test.js — these confirm it's optional and that the
  // $ref wiring is live.
  describe('supportingReferences', () => {
    test('is optional', () => {
      const payload = { movementIds, ...deliveryDetails }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid supportingReferences', () => {
      const payload = {
        movementIds,
        ...deliveryDetails,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects a payload whose supportingReferences is invalid', () => {
      const payload = {
        movementIds,
        ...deliveryDetails,
        supportingReferences: [{ ...supportingReference, label: 'Not A Label' }]
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })

  // carrier's own rules are covered by carrier.test.js — these confirm
  // it's required, that it's a single carrier rather than a list, and that the
  // $ref wiring is live.
  describe('carrier', () => {
    test('is required', () => {
      const { valid, errors } = validateAjv({ movementIds })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'carrier' }
        })
      )
    })

    test('rejects a list of carriers', () => {
      const { valid, errors } = validateAjv({
        movementIds,
        carrier: [carrier]
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'type', instancePath: '/carrier' })
      )
    })

    test('rejects a payload whose carrier is invalid', () => {
      const { organisationName, ...invalidCarrier } = carrier
      const { valid, errors } = validateAjv({
        movementIds,
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

  describe('deliveryDateTime', () => {
    test('is required', () => {
      const { valid, errors } = validateAjv({
        movementIds,
        carrier,
        deliverySite
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'deliveryDateTime' }
        })
      )
    })

    test.each([['2025-09-15T12:12:28Z'], ['2025-09-15T13:12:28+01:00']])(
      'accepts the ISO 8601 date-time %j',
      (value) => {
        const payload = {
          movementIds,
          ...deliveryDetails,
          deliveryDateTime: value
        }
        expect(validateAjv(payload).valid).toBe(true)
      }
    )

    test.each([
      [''],
      ['14:30-12-12-25'],
      ['2025-09-15'],
      ['2025-09-15T12:12:28']
    ])(
      'rejects %j, which is not an ISO 8601 date-time with a timezone',
      (value) => {
        const { valid, errors } = validateAjv({
          movementIds,
          ...deliveryDetails,
          deliveryDateTime: value
        })

        expect(valid).toBe(false)
        expect(errors).toContainEqual(
          expect.objectContaining({
            keyword: 'format',
            instancePath: '/deliveryDateTime'
          })
        )
      }
    )
  })

  // deliverySite's own rules are covered by delivery-site.test.js — these
  // confirm it's required and that the $ref wiring is live.
  describe('deliverySite', () => {
    test('is required', () => {
      const { valid, errors } = validateAjv({
        movementIds,
        carrier,
        deliveryDateTime
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'deliverySite' }
        })
      )
    })

    test('rejects a payload whose deliverySite is invalid', () => {
      const { valid, errors } = validateAjv({
        movementIds,
        ...deliveryDetails,
        deliverySite: { ...deliverySite, rpsNumbers: [-343] }
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'minimum',
          instancePath: '/deliverySite/rpsNumbers/0'
        })
      )
    })
  })
})
