import path from 'node:path'
import { createLogger } from '#/common/helpers/logging/logger.js'
import { createValidators } from './create-validators.js'

const fixtureRoot = path.join(import.meta.dirname, 'test-fixtures')
const validators = createValidators(fixtureRoot)

const shipment = {
  reference: '25b14080-5e77-4f91-9957-2482a0cb8775',
  meansOfTransport: 'RAIL'
}

const getDetails = (value, name = 'shipment-request') => {
  try {
    validators.request(name)(value)
  } catch (error) {
    return error.details
  }
  throw new Error('expected validation to fail')
}

describe('request', () => {
  test('returns the value unchanged when it is valid', () => {
    expect(validators.request('shipment-request')(shipment)).toBe(shipment)
  })

  test('throws a Boom badRequest whose message joins every error', () => {
    let error
    try {
      validators.request('shipment-request')({})
    } catch (thrown) {
      error = thrown
    }

    expect(error.output.statusCode).toBe(400)
    expect(error.message).toBe(
      "'reference' is required. 'meansOfTransport' is required"
    )
  })

  test('maps a missing property to NotProvided', () => {
    expect(getDetails({ ...shipment, reference: undefined })).toEqual([
      {
        message: "'reference' is required",
        path: ['reference'],
        type: 'NotProvided'
      }
    ])
  })

  test('maps an additional property to NotAllowed', () => {
    const [detail] = getDetails({ ...shipment, extra: 'x' })

    expect(detail).toMatchObject({ path: ['extra'], type: 'NotAllowed' })
  })

  test('maps a format mismatch to InvalidFormat', () => {
    expect(getDetails({ ...shipment, reference: 'not-a-uuid' })).toEqual([
      {
        message: "must match format 'uuid'",
        path: ['reference'],
        type: 'InvalidFormat'
      }
    ])
  })

  test('maps a pattern mismatch to InvalidFormat, nesting the path', () => {
    const [detail] = getDetails({
      ...shipment,
      address: { postcode: 'NOTAPOSTCODE' }
    })

    expect(detail).toMatchObject({
      message: expect.stringMatching(/^must match pattern '.+'$/),
      path: ['address', 'postcode'],
      type: 'InvalidFormat'
    })
  })

  test('maps a minLength violation to OutOfRange', () => {
    const [detail] = getDetails({ ...shipment, note: '' })

    expect(detail).toMatchObject({ path: ['note'], type: 'OutOfRange' })
  })

  test('maps an exclusiveMinimum violation to OutOfRange', () => {
    const [detail] = getDetails({ ...shipment, weight: 0 })

    expect(detail).toMatchObject({ path: ['weight'], type: 'OutOfRange' })
  })

  test('maps a value outside an enum to InvalidValue, listing the values', () => {
    expect(getDetails({ ...shipment, label: 'Purchase order' })).toEqual([
      {
        message: "must be one of: 'PO_NUMBER', 'OTHER'",
        path: ['label'],
        type: 'InvalidValue'
      }
    ])
  })

  test('maps a broken oneOf with nothing more specific to BusinessRuleViolation', () => {
    expect(getDetails({ ...shipment, count: 1 })).toEqual([
      {
        message: 'must match exactly one schema in oneOf',
        path: ['count'],
        type: 'BusinessRuleViolation'
      }
    ])
  })

  test('maps any other keyword to UnexpectedError with ajv’s message', () => {
    expect(getDetails({ ...shipment, tags: ['a', 'a'] })).toEqual([
      {
        message: expect.stringContaining('must NOT have duplicate items'),
        path: ['tags'],
        type: 'UnexpectedError'
      }
    ])
  })

  describe('composition keyword summaries', () => {
    test.each([
      {
        rule: 'if/then',
        value: { ...shipment, meansOfTransport: 'ROAD' },
        expected: [
          {
            message: "Required when 'meansOfTransport' is 'ROAD'",
            path: ['vehicleRegistration'],
            type: 'NotProvided'
          }
        ]
      },
      {
        rule: 'if/else',
        value: { ...shipment, vehicleRegistration: 'AB12 CDE' },
        expected: [
          {
            message: "Not allowed unless 'meansOfTransport' is 'ROAD'",
            path: ['vehicleRegistration'],
            type: 'NotAllowed'
          }
        ]
      }
    ])(
      'reports only the specific errors when $rule fails',
      ({ value, expected }) => {
        expect(getDetails(value)).toEqual(expected)
      }
    )
  })

  describe('a value of the wrong type', () => {
    test('is reported once, not once per oneOf branch', () => {
      expect(getDetails({ ...shipment, contact: 5 })).toEqual([
        {
          message: 'must be string',
          path: ['contact'],
          type: 'InvalidType'
        },
        {
          message: 'must be object',
          path: ['contact'],
          type: 'InvalidType'
        }
      ])
    })

    test('hides the errors below it', () => {
      // The email branch says contact must be a string; the object branch's
      // missing phoneNumber sits below that, so it is left out.
      expect(getDetails({ ...shipment, contact: {} })).toEqual([
        {
          message: 'must be string',
          path: ['contact'],
          type: 'InvalidType'
        }
      ])
    })
  })
})

describe('response', () => {
  const responseSchemaId = 'shipment-response.schema.json'
  const validBody = { data: { shipmentId: 'S1' } }
  const invalidBody = { data: {} }
  let errorSpy

  beforeEach(() => {
    errorSpy = vi.spyOn(createLogger(), 'error').mockImplementation(() => {})
  })

  test('returns the value unchanged when it is valid', () => {
    expect(validators.response('shipment-response')(validBody)).toBe(validBody)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  test('throws and logs the schema id and ajv errors when the value is invalid', () => {
    expect(() => validators.response('shipment-response')(invalidBody)).toThrow(
      `Response does not match ${responseSchemaId}`
    )
    expect(errorSpy).toHaveBeenCalledWith(
      {
        schemaId: responseSchemaId,
        errors: [
          expect.objectContaining({
            keyword: 'required',
            instancePath: '/data',
            params: { missingProperty: 'shipmentId' }
          })
        ]
      },
      'Response failed schema validation'
    )
  })

  test('leaves the response body out of the logged errors', () => {
    expect(() =>
      validators.response('shipment-response')(invalidBody)
    ).toThrow()
    const [[{ errors }]] = errorSpy.mock.calls
    expect(errors[0]).not.toHaveProperty('data')
    expect(errors[0]).not.toHaveProperty('parentSchema')
  })

  test('throws for an unknown schema name', () => {
    expect(() => validators.response('does-not-exist')(validBody)).toThrow(
      'No schema registered under "does-not-exist.schema.json".'
    )
  })
})
