import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { apiCode1 } from '#test/data/api-codes.js'
import { requestBasicAuthTest1 } from '#test/data/basic-auth.js'
import { test as routeTest } from '#test/helpers/route-fixtures.js'
import { breakNextResponse } from '#test/helpers/break-next-response.js'
import { organisationHeaders } from '#test/data/organisation-headers.js'
import {
  brokerOrDealerEntry,
  carrier,
  collectionDateTime,
  collectionSite,
  supportingReference,
  longText
} from '../schemas/test-helpers.js'
import { version } from '../index.js'

const { apiVersion } = version

const movementService = version.movements

vi.mock('#/common/http/waste-tracking.js', () => ({
  createMovementId: vi.fn().mockResolvedValue('26S8EYDJ'),
  createDeliveryId: vi.fn().mockResolvedValue('26S8EYDJ')
}))

const errorMessage = 'Database connection failed'
const traceId = 'created-trace-id-123'
const isDutyOfCareConfirmed = true
const goodPayload = {
  carrier,
  collectionDateTime,
  collectionSite,
  isDutyOfCareConfirmed
}
const goodMovementId = '25HRA0B2'

const expectedTypeBase =
  'https://defra.github.io/digital-waste-tracking-api-site/preview/problems/'

const test = routeTest.extend({
  // Submits a collection for goodMovementId
  submitCollection: async ({ server }, use) => {
    await use((payload) =>
      server.inject({
        method: 'POST',
        url: `/${apiVersion}/movements/${goodMovementId}/collection`,
        payload,
        headers: {
          'x-cdp-request-id': traceId,
          Authorization: `Basic ${requestBasicAuthTest1}`,
          ...organisationHeaders
        }
      })
    )
  },

  // Expects the collection to be accepted for a movement that exists
  expectCollectionCreated: async ({ submitCollection }, use) => {
    await use(async (payload) => {
      vi.spyOn(movementService, 'getMovementRecord').mockResolvedValue({
        id: goodMovementId
      })

      const { statusCode } = await submitCollection(payload)

      expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    })
  },

  // Expects the collection to be rejected before the movement is looked up
  expectCollectionRejected: async ({ submitCollection }, use) => {
    await use(async (payload, errors) => {
      const getMovementRecordSpy = vi.spyOn(
        movementService,
        'getMovementRecord'
      )

      const { statusCode, result } = await submitCollection(payload)

      expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(result.errors).toEqual(errors)
      expect(getMovementRecordSpy).toHaveBeenCalledTimes(0)
    })
  }
})

describe(`collection Route Tests version: ${apiVersion}`, () => {
  // Scenario: A Collection is created when a carrier confirms duty of care.
  test('creates a collection when a valid movementId is provided', async ({
    server
  }) => {
    const getMovementRecordSpy = vi
      .spyOn(movementService, 'getMovementRecord')
      .mockResolvedValue({ id: goodMovementId })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${apiVersion}/movements/${goodMovementId}/collection`,
      payload: goodPayload,
      headers: {
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: null,
      validation: { warnings: [] }
    })
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(1)
  })

  test('creates a collection when a brokerOrDealer is declared', async ({
    server
  }) => {
    const payload = {
      carrier,
      collectionDateTime,
      collectionSite,
      isDutyOfCareConfirmed,
      brokerOrDealer: { isPresent: true, items: [brokerOrDealerEntry] }
    }
    const getMovementRecordSpy = vi
      .spyOn(movementService, 'getMovementRecord')
      .mockResolvedValue({ id: goodMovementId })
    const url = `/${apiVersion}/movements/${goodMovementId}/collection`
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload,
      headers: {
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: null,
      validation: { warnings: [] }
    })
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(1)
  })

  test('returns an error when a declared brokerOrDealer has no details', async ({
    server
  }) => {
    const invalidPayload = {
      carrier,
      collectionDateTime,
      collectionSite,
      isDutyOfCareConfirmed,
      brokerOrDealer: { isPresent: true }
    }
    const getMovementRecordSpy = vi.spyOn(movementService, 'getMovementRecord')
    const url = `/${apiVersion}/movements/${goodMovementId}/collection`
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toEqual([
      {
        errorType: 'NotProvided',
        message: "Required when 'isPresent' is true",
        pointer: '/brokerOrDealer/items'
      }
    ])
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  test('returns an error when brokerOrDealer details are given without declaring involvement', async ({
    server
  }) => {
    const invalidPayload = {
      carrier,
      collectionDateTime,
      collectionSite,
      isDutyOfCareConfirmed,
      brokerOrDealer: { isPresent: false, items: [brokerOrDealerEntry] }
    }
    const getMovementRecordSpy = vi.spyOn(movementService, 'getMovementRecord')
    const url = `/${apiVersion}/movements/${goodMovementId}/collection`
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toEqual([
      {
        errorType: 'NotAllowed',
        message: "Not allowed when 'isPresent' is false or absent",
        pointer: '/brokerOrDealer/items'
      }
    ])
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  test('creates a collection when supportingReferences are provided', async ({
    server
  }) => {
    const payload = {
      carrier,
      collectionDateTime,
      collectionSite,
      isDutyOfCareConfirmed,
      supportingReferences: [supportingReference]
    }
    const getMovementRecordSpy = vi
      .spyOn(movementService, 'getMovementRecord')
      .mockResolvedValue({ id: goodMovementId })
    const url = `/${apiVersion}/movements/${goodMovementId}/collection`
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload,
      headers: {
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: null,
      validation: { warnings: [] }
    })
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(1)
  })

  test('returns an error when a supportingReference has an unrecognised label', async ({
    server
  }) => {
    const invalidPayload = {
      carrier,
      collectionDateTime,
      collectionSite,
      isDutyOfCareConfirmed,
      supportingReferences: [{ ...supportingReference, label: 'Not A Label' }]
    }
    const getMovementRecordSpy = vi.spyOn(movementService, 'getMovementRecord')
    const url = `/${apiVersion}/movements/${goodMovementId}/collection`
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toEqual([
      {
        errorType: 'InvalidValue',
        message:
          "must be one of: 'WEIGHBRIDGE_NUMBER', 'PO_NUMBER', 'JOB_NUMBER', 'INVOICE_NUMBER', 'WASTE_TICKET_NUMBER', 'OTHER'",
        pointer: '/supportingReferences/0/label'
      }
    ])
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  test('creates a collection when specialHandlingRequirements are provided', async ({
    server
  }) => {
    const payload = {
      carrier,
      collectionDateTime,
      collectionSite,
      isDutyOfCareConfirmed,
      specialHandlingRequirements: 'Handle with care and keep upright.'
    }
    const getMovementRecordSpy = vi
      .spyOn(movementService, 'getMovementRecord')
      .mockResolvedValue({ id: goodMovementId })
    const url = `/${apiVersion}/movements/${goodMovementId}/collection`
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload,
      headers: {
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: null,
      validation: { warnings: [] }
    })
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(1)
  })

  test('returns an error when specialHandlingRequirements is too long', async ({
    server
  }) => {
    const invalidPayload = {
      isDutyOfCareConfirmed,
      specialHandlingRequirements: 'A'.repeat(longText + 1)
    }
    const getMovementRecordSpy = vi.spyOn(movementService, 'getMovementRecord')
    const url = `/${apiVersion}/movements/${goodMovementId}/collection`
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        pointer: '/specialHandlingRequirements'
      })
    )
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  test('rejects when no organisation was forwarded (unknown or disabled API code)', async ({
    server
  }) => {
    const getMovementRecordSpy = vi.spyOn(movementService, 'getMovementRecord')

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${apiVersion}/movements/${goodMovementId}/collection`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: 'the API Code supplied is invalid',
      instance: `/${apiVersion}/movements/25HRA0B2/collection`,
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  test('handles when given movementId is not in the system', async ({
    server
  }) => {
    const getMovementRecordSpy = vi
      .spyOn(movementService, 'getMovementRecord')
      .mockResolvedValue(null)

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${apiVersion}/movements/${goodMovementId}/collection`,
      payload: goodPayload,
      headers: {
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.NOT_FOUND)
    expect(result).toEqual({
      detail: 'movementId not found',
      instance: `/${apiVersion}/movements/25HRA0B2/collection`,
      title: 'Not Found',
      type: `${expectedTypeBase}not-found`
    })
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(1)
  })

  test('returns an error when carrier is missing', async ({ server }) => {
    const invalidPayload = {
      collectionDateTime,
      collectionSite,
      isDutyOfCareConfirmed
    }
    const getMovementRecordSpy = vi.spyOn(movementService, 'getMovementRecord')

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${apiVersion}/movements/${goodMovementId}/collection`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
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
      instance: `/${apiVersion}/movements/${goodMovementId}/collection`,
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  test('returns a 400 when the movementId is not in the ID format', async ({
    server
  }) => {
    const getMovementRecordSpy = vi.spyOn(movementService, 'getMovementRecord')
    const badMovementId = 'NONEXISTENT'

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${apiVersion}/movements/${badMovementId}/collection`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toEqual([
      {
        errorType: 'InvalidFormat',
        message: "must match pattern '^[0-9]{2}[A-Z0-9]{6,7}$'",
        pointer: '/movementId'
      }
    ])
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  // apiCode is sent in the x-api-code header and resolved by the
  // external API, so the backend rejects it in the body.
  test('returns an error when apiCode is sent in the body', async ({
    server
  }) => {
    const invalidPayload = {
      apiCode: apiCode1,
      isDutyOfCareConfirmed,
      carrier,
      collectionDateTime,
      collectionSite
    }
    const getMovementRecordSpy = vi.spyOn(movementService, 'getMovementRecord')

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${apiVersion}/movements/${goodMovementId}/collection`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
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
      instance: `/${apiVersion}/movements/25HRA0B2/collection`,
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  // Scenario: A Collection isn't created when a carrier fails to submit a duty
  // of care.
  test('returns an error when the duty of care confirmation is missing and does not create a collection', async ({
    server
  }) => {
    const invalidPayload = { carrier, collectionDateTime, collectionSite }
    const getMovementRecordSpy = vi.spyOn(movementService, 'getMovementRecord')
    const url = `/${apiVersion}/movements/${goodMovementId}/collection`
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: "'isDutyOfCareConfirmed' is required",
          pointer: '/isDutyOfCareConfirmed'
        }
      ],
      instance: url,
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  test('handles error when getting movement', async ({ server }) => {
    const getMovementRecordSpy = vi
      .spyOn(movementService, 'getMovementRecord')
      .mockRejectedValue(new Error(errorMessage))

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${apiVersion}/movements/${goodMovementId}/collection`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      instance: `/${apiVersion}/movements/25HRA0B2/collection`,
      title: 'Internal Server Error',
      type: `${expectedTypeBase}internal-server-error`,
      requestId: traceId
    })

    expect(getMovementRecordSpy).toHaveBeenCalledTimes(1)
  })

  test('should immediately return 401 when request is unauthenticated', async ({
    server
  }) => {
    const getMovementRecordSpy = vi.spyOn(movementService, 'getMovementRecord')

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${apiVersion}/movements/${goodMovementId}/collection`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED)
    expect(result).toEqual({
      detail: 'Missing authentication',
      instance: `/${apiVersion}/movements/25HRA0B2/collection`,
      title: 'Unauthorized',
      type: `${expectedTypeBase}unauthorized`,
      requestId: traceId
    })
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  test('returns a 500 when the response body does not match the response schema', async ({
    server
  }) => {
    vi.spyOn(movementService, 'getMovementRecord').mockResolvedValueOnce({
      id: goodMovementId
    })
    breakNextResponse(server, (body) => ({ ...body, data: 'not-an-object' }))

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${apiVersion}/movements/${goodMovementId}/collection`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      instance: `/${apiVersion}/movements/${goodMovementId}/collection`,
      title: 'Internal Server Error',
      type: `${expectedTypeBase}internal-server-error`,
      requestId: traceId
    })
  })

  describe('Feature: Declare where and when the waste is collected', () => {
    // Background: authenticated, with a valid API Code and Movement ID — every
    // request here sends the basic auth and organisation headers to
    // goodMovementId.
    const without = (field, from) => {
      const { [field]: excluded, ...rest } = from
      return rest
    }
    const withCollectionSite = (site) => ({
      ...goodPayload,
      collectionSite: site
    })
    const notProvided = (field, pointer) => ({
      errorType: 'NotProvided',
      message: `'${field}' is required`,
      pointer
    })

    describe('Scenario: A Collection is created with valid collection site details', () => {
      test('creates the collection with a valid actual collection date and time, a collection address and contact details', async ({
        expectCollectionCreated
      }) => {
        await expectCollectionCreated(goodPayload)
      })
    })

    describe("Scenario: A Collection isn't created without an actual collection date and time", () => {
      test('rejects the collection, saying the actual collection date and time is required', async ({
        expectCollectionRejected
      }) => {
        await expectCollectionRejected(
          without('collectionDateTime', goodPayload),
          [notProvided('collectionDateTime', '/collectionDateTime')]
        )
      })
    })

    describe("Scenario Outline: A Collection isn't created without a collection address", () => {
      test('rejects a collection site with no address, saying the address is required', async ({
        expectCollectionRejected
      }) => {
        await expectCollectionRejected(
          withCollectionSite(without('address', collectionSite)),
          [notProvided('address', '/collectionSite/address')]
        )
      })

      test('rejects a collection with no collection site, saying it is required', async ({
        expectCollectionRejected
      }) => {
        await expectCollectionRejected(without('collectionSite', goodPayload), [
          notProvided('collectionSite', '/collectionSite')
        ])
      })
    })

    describe("Scenario: A Collection isn't created without a collection contact detail", () => {
      test('rejects a valid collection address with no contact details, saying they are required', async ({
        expectCollectionRejected
      }) => {
        await expectCollectionRejected(
          withCollectionSite(without('contactDetails', collectionSite)),
          [notProvided('contactDetails', '/collectionSite/contactDetails')]
        )
      })
    })

    describe("Scenario: A Collection isn't created when an actual collection date and time is invalid", () => {
      test.for([
        ['2026-01-15'],
        ['09:30:00'],
        ['15/01/2026 09:30'],
        ['2026-01-15T09:30:00'],
        ['not-a-date']
      ])(
        'rejects an actual collection date and time of %j',
        async ([value], { expectCollectionRejected }) => {
          await expectCollectionRejected(
            { ...goodPayload, collectionDateTime: value },
            [
              {
                errorType: 'InvalidFormat',
                message: "must match format 'date-time'",
                pointer: '/collectionDateTime'
              }
            ]
          )
        }
      )
    })

    describe("Scenario: A Collection isn't created when a collection contact detail is invalid", () => {
      test('rejects an invalid collection email address', async ({
        expectCollectionRejected
      }) => {
        await expectCollectionRejected(
          withCollectionSite({
            ...collectionSite,
            contactDetails: { emailAddress: 'not-an-email' }
          }),
          [
            {
              errorType: 'InvalidFormat',
              message: "must match format 'email'",
              pointer: '/collectionSite/contactDetails/emailAddress'
            }
          ]
        )
      })

      test('rejects an invalid collection phone number', async ({
        expectCollectionRejected
      }) => {
        await expectCollectionRejected(
          withCollectionSite({
            ...collectionSite,
            contactDetails: { phoneNumber: 'not-a-number' }
          }),
          [
            expect.objectContaining({
              errorType: 'InvalidFormat',
              pointer: '/collectionSite/contactDetails/phoneNumber'
            })
          ]
        )
      })

      test('rejects both an invalid email address and phone number, reporting each', async ({
        expectCollectionRejected
      }) => {
        await expectCollectionRejected(
          withCollectionSite({
            ...collectionSite,
            contactDetails: {
              emailAddress: 'not-an-email',
              phoneNumber: 'not-a-number'
            }
          }),
          [
            expect.objectContaining({
              errorType: 'InvalidFormat',
              pointer: '/collectionSite/contactDetails/emailAddress'
            }),
            expect.objectContaining({
              errorType: 'InvalidFormat',
              pointer: '/collectionSite/contactDetails/phoneNumber'
            })
          ]
        )
      })
    })

    describe("Scenario: A Collection isn't created when the collection postcode is invalid", () => {
      test.for([['NOT A POSTCODE'], ['12345'], ['TE1']])(
        'rejects a collection postcode of %j',
        async ([postcode], { expectCollectionRejected }) => {
          await expectCollectionRejected(
            withCollectionSite({
              ...collectionSite,
              address: { ...collectionSite.address, postcode }
            }),
            [
              expect.objectContaining({
                errorType: 'InvalidFormat',
                pointer: '/collectionSite/address/postcode'
              })
            ]
          )
        }
      )
    })
  })
})
