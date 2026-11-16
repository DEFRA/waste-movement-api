import {
  receiptDateTime,
  apiCode,
  brokerOrDealerEntry,
  supportingReference,
  carrier,
  receiver,
  validatorFor,
  physicalDetails,
  treatment
} from '../test-helpers.js'

const validateAjv = validatorFor('receipt/record-receipt-request.schema.json')

describe('record-receipt-request schema', () => {
  const brokerOrDealer = { isPresent: true, items: [brokerOrDealerEntry] }
  const treatments = [treatment]

  test('accepts a valid payload', () => {
    expect(
      validateAjv({
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments
      }).valid
    ).toBe(true)
  })

  // apiCode is sent in the x-api-code header, not the body.
  test('rejects apiCode in the body', () => {
    expect(
      validateAjv({
        receiptDateTime,
        apiCode,
        carrier,
        receiver,
        physicalDetails,
        treatments
      }).valid
    ).toBe(false)
  })

  test('rejects an additional property beyond the declared ones', () => {
    expect(
      validateAjv({
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments,
        extra: 'not allowed'
      }).valid
    ).toBe(false)
  })

  // Hazardous properties are declared per waste item, in its classification,
  // not on the receipt.
  test('rejects hazardous as an unknown property', () => {
    const { valid, errors } = validateAjv({
      receiptDateTime,
      carrier,
      receiver,
      physicalDetails,
      treatments,
      hazardous: { isPresent: false }
    })

    expect(valid).toBe(false)
    expect(errors).toContainEqual(
      expect.objectContaining({
        keyword: 'additionalProperties',
        instancePath: '',
        params: { additionalProperty: 'hazardous' }
      })
    )
  })

  // The format rules are covered by common/receipt-date-time.test.js — these
  // confirm it's required and that the $ref wiring is live.
  describe('receiptDateTime', () => {
    const validPayload = {
      receiptDateTime,
      carrier,
      receiver,
      physicalDetails,
      treatments
    }

    test('is required', () => {
      const { receiptDateTime: excluded, ...payload } = validPayload
      const { valid, errors } = validateAjv(payload)

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'receiptDateTime' }
        })
      )
    })

    test('applies the receipt-date-time rules', () => {
      const { valid, errors } = validateAjv({
        ...validPayload,
        receiptDateTime: '14/10/2026'
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'format',
          instancePath: '/receiptDateTime'
        })
      )
    })
  })

  // carrier's own rules are covered by carrier.test.js — these confirm
  // it's required, that it's a single carrier rather than a list, and that the
  // $ref wiring is live.
  describe('carrier', () => {
    test('is required', () => {
      const { valid, errors } = validateAjv({
        receiptDateTime,
        receiver,
        physicalDetails,
        treatments
      })

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
        receiptDateTime,
        carrier: [carrier],
        receiver,
        physicalDetails,
        treatments
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'type', instancePath: '/carrier' })
      )
    })

    test('rejects a payload whose carrier is invalid', () => {
      const { organisationName, ...invalidCarrier } = carrier
      const { valid, errors } = validateAjv({
        receiptDateTime,
        carrier: invalidCarrier,
        receiver,
        physicalDetails,
        treatments
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

  // receiver's own rules are covered by receiver/receiver.test.js — these
  // confirm it's required, that it's a single receiver rather than a list, and
  // that the $ref wiring is live.
  describe('receiver', () => {
    test('is required', () => {
      const { valid, errors } = validateAjv({
        receiptDateTime,
        carrier,
        physicalDetails,
        treatments
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'receiver' }
        })
      )
    })

    test('rejects a list of receivers', () => {
      const { valid, errors } = validateAjv({
        receiptDateTime,
        carrier,
        receiver: [receiver],
        physicalDetails,
        treatments
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'type', instancePath: '/receiver' })
      )
    })

    test('rejects a payload whose receiver is invalid', () => {
      const { siteName, ...invalidReceiver } = receiver
      const { valid, errors } = validateAjv({
        receiptDateTime,
        carrier,
        receiver: invalidReceiver,
        physicalDetails,
        treatments
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '/receiver',
          params: { missingProperty: 'siteName' }
        })
      )
    })
  })

  // physicalDetails' own rules are covered by
  // waste-item/physical-details.test.js — these confirm physicalDetails is
  // required and that the $ref wiring is live.
  describe('physicalDetails', () => {
    // Scenario: A Receipt is created when a valid physical form, containers
    // and weight are declared.
    test('accepts valid physical details', () => {
      expect(
        validateAjv({
          receiptDateTime,
          carrier,
          receiver,
          physicalDetails,
          treatments
        }).valid
      ).toBe(true)
    })

    test('is required', () => {
      const { valid, errors } = validateAjv({
        receiptDateTime,
        carrier,
        receiver
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'physicalDetails' }
        })
      )
    })

    test('rejects a list of physical details', () => {
      const { valid, errors } = validateAjv({
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails: [physicalDetails]
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/physicalDetails'
        })
      )
    })

    test('rejects invalid physical details, reporting the error against the field', () => {
      const { valid, errors } = validateAjv({
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails: { ...physicalDetails, form: 'solid' }
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'enum',
          instancePath: '/physicalDetails/form'
        })
      )
    })
  })

  // A treatment's rules are covered by waste-item/treatment*.test.js — these
  // confirm at least one treatment is required and that the $ref wiring is live.
  describe('treatments', () => {
    // Scenario: A Receipt is created when a treatment with a valid disposal or
    // recovery code and weight is declared.
    test('accepts a valid treatment', () => {
      expect(
        validateAjv({
          receiptDateTime,
          carrier,
          receiver,
          physicalDetails,
          treatments
        }).valid
      ).toBe(true)
    })

    // Scenario: A Receipt is created when more than one treatment is declared.
    test('accepts more than one treatment', () => {
      const disposal = { ...treatment, disposalOrRecoveryCode: 'D10' }
      expect(
        validateAjv({
          receiptDateTime,
          carrier,
          receiver,
          physicalDetails,
          treatments: [treatment, disposal]
        }).valid
      ).toBe(true)
    })

    // Scenario: A Receipt isn't created when no treatment is declared.
    test('is required', () => {
      const { valid, errors } = validateAjv({
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'treatments' }
        })
      )
    })

    test('rejects an empty list of treatments', () => {
      const { valid, errors } = validateAjv({
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments: []
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'minItems',
          instancePath: '/treatments'
        })
      )
    })

    test('rejects an invalid treatment, reporting the error against that treatment', () => {
      const { valid, errors } = validateAjv({
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments: [{ ...treatment, disposalOrRecoveryCode: 'R99' }]
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'enum',
          instancePath: '/treatments/0/disposalOrRecoveryCode'
        })
      )
    })

    // Scenario: A Receipt isn't created when any one of several treatments is
    // declared with missing or invalid details.
    test('reports each invalid field of each invalid treatment, and nothing for a valid one', () => {
      const { disposalOrRecoveryCode, ...noCode } = treatment
      const { valid, errors } = validateAjv({
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments: [
          treatment,
          { ...noCode, weight: { ...treatment.weight, unit: 'Litres' } },
          {
            ...treatment,
            disposalOrRecoveryCode: 'X1',
            weight: { ...treatment.weight, amount: 0 }
          }
        ]
      })

      expect(valid).toBe(false)
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: 'required',
            instancePath: '/treatments/1',
            params: { missingProperty: 'disposalOrRecoveryCode' }
          }),
          expect.objectContaining({
            keyword: 'enum',
            instancePath: '/treatments/1/weight/unit'
          }),
          expect.objectContaining({
            keyword: 'enum',
            instancePath: '/treatments/2/disposalOrRecoveryCode'
          }),
          expect.objectContaining({
            keyword: 'exclusiveMinimum',
            instancePath: '/treatments/2/weight/amount'
          })
        ])
      )
      expect(
        errors.filter(({ instancePath }) =>
          instancePath.startsWith('/treatments/0')
        )
      ).toEqual([])
    })
  })

  describe('brokerOrDealer', () => {
    test('is optional', () => {
      const payload = {
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts a declared broker or dealer', () => {
      const payload = {
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments,
        brokerOrDealer
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    // The rules themselves live in broker-or-dealer.test.js; this only proves
    // the $ref is wired up, so a rejection propagates to the payload.
    test('rejects a payload whose broker or dealer is invalid', () => {
      const payload = {
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments,
        brokerOrDealer: { isPresent: false, items: brokerOrDealer.items }
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
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments,
        brokerOrDealer
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid supportingReferences', () => {
      const payload = {
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects a payload whose supportingReferences is invalid', () => {
      const payload = {
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments,
        supportingReferences: [{ ...supportingReference, label: 'Not A Label' }]
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })
})
