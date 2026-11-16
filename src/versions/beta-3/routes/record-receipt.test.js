import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { apiCode1 } from '#test/data/api-codes.js'
import { requestBasicAuthTest1 } from '#test/data/basic-auth.js'
import { test as routeTest } from '#test/helpers/route-fixtures.js'
import { breakNextResponse } from '#test/helpers/break-next-response.js'
import { organisationHeaders } from '#test/data/organisation-headers.js'
import {
  receiptDateTime,
  brokerOrDealerEntry,
  supportingReference,
  carrier,
  receiver,
  physicalDetails,
  treatment
} from '../schemas/test-helpers.js'
import { collectionName, version } from '../index.js'

const { apiVersion } = version
import { createLogger } from '#/common/helpers/logging/logger.js'

const delivery = version.deliveries

const backoffOptionsConfig = vi.hoisted(() => ({
  numOfAttempts: 3,
  startingDelay: 1
}))
const treatments = [treatment]

vi.mock('@defra/waste-movement-utils', async () => {
  const originalModule = await vi.importActual('@defra/waste-movement-utils')

  return {
    ...originalModule,
    backoffOptions: () => backoffOptionsConfig
  }
})

vi.mock('#/common/http/waste-tracking.js', () => ({
  createMovementId: vi.fn().mockResolvedValue('25KMT4Z9'),
  createDeliveryId: vi.fn().mockResolvedValue('25KMT4Z9')
}))

const deliveryId = '25KMT4Z9'
const url = `/${apiVersion}/deliveries/${deliveryId}/receipt`
const traceId = 'trace-id-123'
const authHeaders = { Authorization: `Basic ${requestBasicAuthTest1}` }
const tracedHeaders = { 'x-cdp-request-id': traceId }
const tracedAuthHeaders = {
  ...authHeaders,
  ...tracedHeaders,
  ...organisationHeaders
}

const expectedTypeBase =
  'https://defra.github.io/digital-waste-tracking-api-site/preview/problems/'

const test = routeTest.extend({
  // Submits a receipt against the delivery
  submit: async ({ server }, use) => {
    await use((payload) =>
      server.inject({
        method: 'POST',
        url,
        payload,
        headers: tracedAuthHeaders
      })
    )
  },

  // Records the delivery, then expects a receipt against it to be accepted
  expectCreated: async ({ server, submit }, use) => {
    await use(async (payload) => {
      await server.db
        .collection(collectionName('deliveries'))
        .insertOne({ deliveryId })

      const { statusCode, result } = await submit(payload)

      expect(statusCode).toEqual(HTTP_STATUS.CREATED)
      expect(result.data).toEqual({ deliveryId })
    })
  },

  // Records the delivery, then expects a receipt against it to be rejected
  expectRejected: async ({ server, submit }, use) => {
    await use(async (payload, errors) => {
      await server.db
        .collection(collectionName('deliveries'))
        .insertOne({ deliveryId })

      const { statusCode, result } = await submit(payload)

      expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(result.errors).toEqual(errors)
    })
  }
})

describe(`POST /${apiVersion}/deliveries/{deliveryId}/receipt`, () => {
  test.beforeEach(async ({ server }) => {
    await server.db.collection(collectionName('deliveries')).deleteMany({})
  })

  test('acknowledges receipt against an existing delivery and returns 201 with the envelope shape', async ({
    server
  }) => {
    await server.db
      .collection(collectionName('deliveries'))
      .insertOne({ deliveryId })

    const { statusCode, result, headers } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { deliveryId },
      validation: { warnings: [] }
    })
    expect(headers['x-request-id']).toBeDefined()
  })

  // Scenario: A Receipt is created when more than one treatment is declared.
  test('acknowledges receipt when more than one treatment is declared', async ({
    server
  }) => {
    await server.db
      .collection(collectionName('deliveries'))
      .insertOne({ deliveryId })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments: [treatment, { ...treatment, disposalOrRecoveryCode: 'D10' }]
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { deliveryId },
      validation: { warnings: [] }
    })
  })

  test('acknowledges receipt when a brokerOrDealer and supportingReferences are provided', async ({
    server
  }) => {
    await server.db
      .collection(collectionName('deliveries'))
      .insertOne({ deliveryId })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments,
        brokerOrDealer: { isPresent: true, items: [brokerOrDealerEntry] },
        supportingReferences: [supportingReference]
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { deliveryId },
      validation: { warnings: [] }
    })
  })

  test('returns a 400 when a declared brokerOrDealer has no details', async ({
    server
  }) => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments,
        brokerOrDealer: { isPresent: true }
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        pointer: '/brokerOrDealer/items'
      })
    )
  })

  test('returns a 400 when a supportingReference has an unrecognised label', async ({
    server
  }) => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments,
        supportingReferences: [{ ...supportingReference, label: 'Not A Label' }]
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        errorType: 'InvalidValue',
        pointer: '/supportingReferences/0/label'
      })
    )
  })

  test('echoes the inbound x-cdp-request-id as x-request-id', async ({
    server
  }) => {
    await server.db
      .collection(collectionName('deliveries'))
      .insertOne({ deliveryId })

    const { headers } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments
      },
      headers: {
        ...authHeaders,
        ...organisationHeaders,
        'x-cdp-request-id': 'trace-id-123'
      }
    })

    expect(headers['x-request-id']).toEqual(traceId)
  })

  test('returns a 404 when the delivery does not exist', async ({ server }) => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.NOT_FOUND)
    expect(result).toEqual({
      detail: `No delivery exists with delivery ID: ${deliveryId}`,
      instance: `/${apiVersion}/deliveries/25KMT4Z9/receipt`,
      title: 'Not Found',
      type: `${expectedTypeBase}not-found`,
      requestId: traceId
    })
  })

  test('returns a 400 when the deliveryId is not in the ID format', async ({
    server
  }) => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${apiVersion}/deliveries/NONEXISTENT/receipt`,
      payload: {},
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toEqual([
      {
        errorType: 'InvalidFormat',
        message: "must match pattern '^[0-9]{2}[A-Z0-9]{6,7}$'",
        pointer: '/deliveryId'
      }
    ])
  })

  // apiCode is sent in the x-api-code header and resolved by the
  // external API, so the backend rejects it in the body.
  test('returns a 400 when apiCode is sent in the body', async ({ server }) => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        apiCode: apiCode1,
        carrier,
        receiver,
        physicalDetails,
        treatments
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotAllowed',
          message: 'must NOT have additional properties',
          pointer: '/apiCode'
        }
      ],
      instance: `/${apiVersion}/deliveries/25KMT4Z9/receipt`,
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  test('returns a 400 when carrier is missing', async ({ server }) => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        receiver,
        physicalDetails,
        treatments
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: "'carrier' is required",
          pointer: '/carrier'
        }
      ],
      instance: `/${apiVersion}/deliveries/25KMT4Z9/receipt`,
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  test('returns a 400 when physicalDetails is missing', async ({ server }) => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { receiptDateTime, carrier, receiver, treatments },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: "'physicalDetails' is required",
          pointer: '/physicalDetails'
        }
      ],
      instance: `/${apiVersion}/deliveries/25KMT4Z9/receipt`,
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  // Scenario: A Receipt isn't created when no treatment is declared.
  test('returns a 400 when treatments is missing', async ({ server }) => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: "'treatments' is required",
          pointer: '/treatments'
        }
      ],
      instance: `/${apiVersion}/deliveries/25KMT4Z9/receipt`,
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  // Scenario: A Receipt isn't created when any one of several treatments is
  // declared with missing or invalid details.
  test('returns a 400 naming each invalid field of each invalid treatment', async ({
    server
  }) => {
    const { weight, ...noWeight } = treatment
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments: [
          treatment,
          noWeight,
          { ...treatment, disposalOrRecoveryCode: 'R14' }
        ]
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toEqual([
      expect.objectContaining({
        errorType: 'NotProvided',
        pointer: '/treatments/1/weight'
      }),
      expect.objectContaining({
        errorType: 'InvalidValue',
        pointer: '/treatments/2/disposalOrRecoveryCode'
      })
    ])
  })

  test('returns a 400 when receiver is missing', async ({ server }) => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        carrier,
        physicalDetails,
        treatments
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: "'receiver' is required",
          pointer: '/receiver'
        }
      ],
      instance: `/${apiVersion}/deliveries/25KMT4Z9/receipt`,
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  test('returns a 400 when no organisation was forwarded (unknown or disabled API code)', async ({
    server
  }) => {
    await server.db
      .collection(collectionName('deliveries'))
      .insertOne({ deliveryId })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments
      },
      headers: { ...authHeaders, ...tracedHeaders }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: 'the API Code supplied is invalid',
      instance: `/${apiVersion}/deliveries/25KMT4Z9/receipt`,
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  test('returns a 500 when the delivery lookup fails', async ({ server }) => {
    const error = 'Database connection failed'
    vi.spyOn(delivery, 'findDeliveryMovementIds').mockRejectedValue(
      new Error(error)
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      instance: `/${apiVersion}/deliveries/25KMT4Z9/receipt`,
      title: 'Internal Server Error',
      type: `${expectedTypeBase}internal-server-error`,
      requestId: traceId
    })
  })

  test('returns 401 when unauthenticated', async ({ server }) => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments
      },
      headers: tracedHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED)
    expect(result).toEqual({
      detail: 'Missing authentication',
      instance: url,
      title: 'Unauthorized',
      type: `${expectedTypeBase}unauthorized`,
      requestId: traceId
    })
  })

  test('returns a 500 when the response body does not match the response schema', async ({
    server
  }) => {
    await server.db
      .collection(collectionName('deliveries'))
      .insertOne({ deliveryId })
    breakNextResponse(server, (body) => ({ ...body, data: {} }))

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        carrier,
        receiver,
        physicalDetails,
        treatments
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      instance: url,
      title: 'Internal Server Error',
      type: `${expectedTypeBase}internal-server-error`,
      requestId: traceId
    })
  })

  describe('Feature: Recording when the waste was actually received', () => {
    const withReceiptDateTime = (value = receiptDateTime) => ({
      receiptDateTime: value,
      carrier,
      receiver,
      physicalDetails,
      treatments
    })

    describe('Scenario: A receipt is recorded when a valid date and time of receipt is declared for a known delivery', () => {
      test.for([
        ['2026-10-14T09:30:00Z'],
        ['2026-10-14T10:30:00+01:00'],
        // A moment ago: anything not later than the time of submission.
        [new Date(Date.now() - 1000).toISOString()]
      ])(
        'records the receipt received at %p',
        async ([value], { expectCreated }) => {
          await expectCreated(withReceiptDateTime(value))
        }
      )
    })

    describe("Scenario Outline: A receipt isn't recorded when the date and time of receipt is missing or invalid", () => {
      const pointer = '/receiptDateTime'

      test('rejects a date and time of receipt that is not provided, as required', async ({
        expectRejected
      }) => {
        const { receiptDateTime: _, ...payload } = withReceiptDateTime()
        await expectRejected(payload, [
          {
            errorType: 'NotProvided',
            message: "'receiptDateTime' is required",
            pointer
          }
        ])
      })

      test('rejects a date and time of receipt of "", as required', async ({
        expectRejected
      }) => {
        await expectRejected(withReceiptDateTime(''), [
          {
            errorType: 'NotProvided',
            message: "'receiptDateTime' is required",
            pointer
          }
        ])
      })

      test.for(['14/10/2026', '2026-13-01T10:00:00Z', 'Yesterday'])(
        'rejects a date and time of receipt of %p as not a valid date and time',
        async (value, { expectRejected }) => {
          await expectRejected(withReceiptDateTime(value), [
            {
              errorType: 'InvalidFormat',
              message: "must match format 'date-time'",
              pointer
            }
          ])
        }
      )

      test('rejects a date and time of receipt in the future', async ({
        expectRejected
      }) => {
        await expectRejected(withReceiptDateTime('2099-01-01T09:00:00Z'), [
          {
            errorType: 'OutOfRange',
            message: 'must not be in the future',
            pointer
          }
        ])
      })
    })
  })

  test('logs a rejected receipt against the Movements delivered under it', async ({
    server
  }) => {
    await server.db
      .collection(collectionName('deliveries'))
      .insertOne({ deliveryId, movementIds: ['25HRA0B1', '25HRA0B2'] })
    const info = vi.spyOn(createLogger(), 'info')

    const { statusCode } = await server.inject({
      method: 'POST',
      url,
      payload: {},
      headers: tracedAuthHeaders
    })

    const journeyLines = info.mock.calls
      .map(([fields]) => fields)
      .filter((fields) => fields?.event?.action === 'receipt-recorded')

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(
      journeyLines.map((fields) => [
        fields['transaction.id'],
        fields['span.id']
      ])
    ).toEqual([
      ['25HRA0B1', deliveryId],
      ['25HRA0B2', deliveryId]
    ])
  })
})
