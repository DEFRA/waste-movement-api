import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { apiCode1 } from '#test/data/api-codes.js'
import {
  requestBasicAuthTest1,
  userBasicAuthTest1
} from '#test/data/basic-auth.js'
import { createServer } from '#/server.js'
import {
  forwardedOrganisationId,
  organisationHeaders
} from '#test/data/organisation-headers.js'
import {
  collectionDateTime,
  collectionSite,
  carrier,
  consignmentNote,
  hazardous,
  hazardousComponent,
  hazardousPresent,
  hazardousWasteItem,
  pops,
  receiver,
  treatment,
  wasteItem
} from '../schemas/test-helpers.js'
import { createMovementId } from '#/common/http/waste-tracking.js'
import { version } from '../index.js'
import { versionedCollections } from '#/common/data/versioned-collections.js'
import { DATA_REVISION } from '../data/revision.js'

const collectionName = versionedCollections('beta-3', DATA_REVISION)

const movementCreate = version.movements

const backoffOptionsConfig = vi.hoisted(() => ({
  numOfAttempts: 3,
  startingDelay: 1
}))

// The real options, so the route's retry callback runs, with fewer, faster attempts
vi.mock('@defra/waste-movement-utils', async () => {
  const originalModule = await vi.importActual('@defra/waste-movement-utils')

  return {
    ...originalModule,
    backoffOptions: (logger) => ({
      ...originalModule.backoffOptions(
        logger,
        backoffOptionsConfig.numOfAttempts
      ),
      startingDelay: backoffOptionsConfig.startingDelay
    })
  }
})

vi.mock('#/common/http/waste-tracking.js', () => ({
  createMovementId: vi.fn().mockResolvedValue('26S8EYDJ'),
  createDeliveryId: vi.fn().mockResolvedValue('26S8EYDJ')
}))

describe('movement Route Tests version: beta-3', () => {
  let server
  const endpointVersion = 'beta-3'
  const errorMessage = 'Database connection failed'
  const traceId = 'created-trace-id-123'
  const producer = {
    wasteSource: 'HOUSEHOLD'
  }
  const intendedCarriers = [carrier]
  const intendedReceivers = [receiver]
  const wasteItems = [wasteItem]
  const goodPayload = {
    producer,
    collectionDateTime,
    collectionSite,
    intendedCarriers,
    intendedReceivers,
    wasteItems
  }

  const commercialProducer = {
    wasteSource: 'COMMERCIAL',
    organisationName: 'ACME Waste Producers Ltd',
    authorisationNumber: 'EAS/P/123456',
    address: {
      fullAddress: '10 Industrial Way, Test City',
      postcode: 'TE1 2PQ'
    },
    contactDetails: {
      emailAddress: 'producer@example.com',
      phoneNumber: '01234567890'
    },
    sicCode: '38110'
  }

  const municipalProducer = {
    wasteSource: 'MUNICIPAL',
    organisationName: 'Test Council',
    reasonForNoAuthorisationNumber: 'TBC',
    address: {
      fullAddress: 'Council Depot, Test City',
      postcode: 'TE1 5CD'
    },
    contactDetails: {
      emailAddress: 'waste.services@example.gov.uk',
      phoneNumber: '01234567890'
    }
  }

  const expectedTypeBase =
    'https://defra.github.io/digital-waste-tracking-api-site/preview/problems/'

  beforeAll(async () => {
    process.env.ACCESS_CRED_TEST1 = userBasicAuthTest1

    server = await createServer()
  })

  afterAll(async () => {
    await server.stop()
  })

  it('creates a movement', async () => {
    const createMovementRecordSpy = vi
      .spyOn(movementCreate, 'createMovementRecord')
      .mockResolvedValue(goodPayload)

    const { statusCode, result, headers } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { movementId: expect.any(String) },
      validation: { warnings: [] }
    })
    expect(headers['x-request-id']).toEqual(traceId)
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(1)
    expect(createMovementRecordSpy).toHaveBeenCalledWith(expect.anything(), {
      movementId: expect.any(String),
      orgId: forwardedOrganisationId,
      wasteItems
    })
  })

  it.each([
    ['COMMERCIAL', commercialProducer],
    ['MUNICIPAL', municipalProducer]
  ])('creates a movement for a %s producer', async (_wasteSource, prod) => {
    const payload = {
      producer: prod,
      collectionDateTime,
      collectionSite,
      intendedCarriers,
      intendedReceivers,
      wasteItems
    }
    const createMovementRecordSpy = vi
      .spyOn(movementCreate, 'createMovementRecord')
      .mockResolvedValue(payload)

    const { statusCode, result, headers } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { movementId: expect.any(String) },
      validation: { warnings: [] }
    })
    expect(headers['x-request-id']).toEqual(traceId)
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(1)
  })

  it('handles error when creating a movement fails', async () => {
    const createMovementRecordSpy = vi
      .spyOn(movementCreate, 'createMovementRecord')
      .mockRejectedValue(new Error(errorMessage))

    const { statusCode, result, headers } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      instance: '/beta-3/movements',
      title: 'Internal Server Error',
      type: `${expectedTypeBase}internal-server-error`,
      requestId: traceId
    })
    expect(headers['content-type']).toContain('application/problem+json')

    expect(createMovementRecordSpy).toHaveBeenCalledTimes(
      backoffOptionsConfig.numOfAttempts
    )
  })

  it('retries a failed write and creates the movement', async () => {
    vi.spyOn(movementCreate, 'createMovementRecord').mockRestore()
    const createMovementRecordSpy = vi
      .spyOn(movementCreate, 'createMovementRecord')
      .mockRejectedValueOnce(new Error(errorMessage))

    const { statusCode } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(2)
  })

  it('creates a movement when a brokerOrDealer is declared', async () => {
    const payload = {
      producer,
      collectionDateTime,
      collectionSite,
      intendedCarriers,
      intendedReceivers,
      wasteItems,
      brokerOrDealer: {
        isPresent: true,
        items: [
          {
            organisationName: 'Broker Demo Ltd',
            registrationNumber: 'CBDU654321',
            contactDetails: { emailAddress: 'broker@example.com' },
            address: {
              fullAddress: '2 Broker Yard, Test City',
              postcode: 'TE1 1ST'
            }
          }
        ]
      }
    }
    const createMovementRecordSpy = vi
      .spyOn(movementCreate, 'createMovementRecord')
      .mockResolvedValue(payload)

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { movementId: expect.any(String) },
      validation: { warnings: [] }
    })
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(1)
  })

  it('returns an error when a declared brokerOrDealer has no details', async () => {
    const invalidPayload = {
      producer,
      collectionDateTime,
      collectionSite,
      intendedCarriers,
      intendedReceivers,
      wasteItems,
      brokerOrDealer: { isPresent: true }
    }
    const createMovementRecordSpy = vi.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
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
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('returns an error when brokerOrDealer details are given without declaring involvement', async () => {
    const invalidPayload = {
      producer,
      collectionDateTime,
      collectionSite,
      intendedCarriers,
      intendedReceivers,
      wasteItems,
      brokerOrDealer: {
        isPresent: false,
        items: [
          {
            organisationName: 'Broker Demo Ltd',
            registrationNumber: 'CBDU654321',
            contactDetails: { emailAddress: 'broker@example.com' }
          }
        ]
      }
    }
    const createMovementRecordSpy = vi.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        errorType: 'NotAllowed',
        pointer: '/brokerOrDealer/items'
      })
    )
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  // apiCode is sent in the x-api-code header and resolved by the
  // external API, so the backend rejects it in the body.
  it('returns an error when apiCode is sent in the body and does not create a movement', async () => {
    const invalidPayload = {
      apiCode: apiCode1,
      producer,
      collectionDateTime,
      collectionSite,
      intendedCarriers,
      intendedReceivers,
      wasteItems
    }
    const createMovementRecordSpy = vi.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
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
      instance: '/beta-3/movements',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })

    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('returns an error when producer is missing and does not create a movement', async () => {
    const invalidPayload = {
      collectionDateTime,
      collectionSite,
      intendedCarriers,
      intendedReceivers,
      wasteItems
    }
    const createMovementRecordSpy = vi.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
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
          message: "'producer' is required",
          pointer: '/producer'
        }
      ],
      instance: '/beta-3/movements',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })

    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  // Scenario: A Movement isn't created when no intended carrier is declared.
  it('returns an error when intendedCarriers is missing and does not create a movement', async () => {
    const invalidPayload = {
      producer,
      collectionDateTime,
      collectionSite,
      intendedReceivers,
      wasteItems
    }
    const createMovementRecordSpy = vi.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
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
          message: "'intendedCarriers' is required",
          pointer: '/intendedCarriers'
        }
      ],
      instance: '/beta-3/movements',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })

    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('returns an error when intendedReceivers is missing and does not create a movement', async () => {
    const invalidPayload = {
      producer,
      collectionDateTime,
      collectionSite,
      intendedCarriers,
      wasteItems
    }
    const createMovementRecordSpy = vi.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
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
          message: "'intendedReceivers' is required",
          pointer: '/intendedReceivers'
        }
      ],
      instance: '/beta-3/movements',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })

    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('returns an error when wasteItems is missing and does not create a movement', async () => {
    const invalidPayload = {
      producer,
      collectionDateTime,
      collectionSite,
      intendedCarriers,
      intendedReceivers
    }
    const createMovementRecordSpy = vi.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
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
          message: "'wasteItems' is required",
          pointer: '/wasteItems'
        }
      ],
      instance: '/beta-3/movements',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })

    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('stores the waste items', async () => {
    // Earlier tests stub createMovementRecord; this one needs the real write.
    vi.spyOn(movementCreate, 'createMovementRecord').mockRestore()
    vi.mocked(createMovementId).mockResolvedValueOnce('26CLS001')

    const { statusCode } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: {
        ...goodPayload,
        wasteItems: [wasteItem, hazardousWasteItem],
        consignmentNote
      },
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    const recordInDb = await server.db
      .collection(collectionName('movements'))
      .findOne({ movementId: '26CLS001' }, { projection: { _id: 0 } })

    expect(recordInDb).toEqual({
      movementId: '26CLS001',
      orgId: forwardedOrganisationId,
      wasteItems: [wasteItem, hazardousWasteItem],
      createdAt: expect.any(String)
    })
  })

  describe('when the movement ID is already stored', () => {
    const movementId = '26DUP001'
    const headers = {
      'x-cdp-request-id': traceId,
      Authorization: `Basic ${requestBasicAuthTest1}`,
      ...organisationHeaders
    }
    const movements = () => server.db.collection(collectionName('movements'))

    beforeEach(async () => {
      vi.spyOn(movementCreate, 'createMovementRecord').mockRestore()
      await movements().deleteMany({ movementId })
    })

    it('counts a retry finding it as the earlier attempt having succeeded', async () => {
      // The first attempt's write lands, but its acknowledgement is lost
      const realCreate = movementCreate.createMovementRecord
      const createMovementRecordSpy = vi
        .spyOn(movementCreate, 'createMovementRecord')
        .mockImplementationOnce(async (db, movement) => {
          await realCreate(db, movement)
          throw new Error('connection reset')
        })
      vi.mocked(createMovementId).mockResolvedValueOnce(movementId)

      const { statusCode, result } = await server.inject({
        method: 'POST',
        url: `/${endpointVersion}/movements`,
        payload: goodPayload,
        headers
      })

      expect(statusCode).toEqual(HTTP_STATUS.CREATED)
      expect(result.data).toEqual({ movementId })
      expect(createMovementRecordSpy).toHaveBeenCalledTimes(2)
      expect(await movements().countDocuments({ movementId })).toBe(1)
    })

    it('is a 500, not retried, when the first attempt finds it: the ID was minted twice', async () => {
      await movements().insertOne({ movementId, orgId: 'another-org' })
      const createMovementRecordSpy = vi.spyOn(
        movementCreate,
        'createMovementRecord'
      )
      vi.mocked(createMovementId).mockResolvedValueOnce(movementId)

      const { statusCode } = await server.inject({
        method: 'POST',
        url: `/${endpointVersion}/movements`,
        payload: goodPayload,
        headers
      })

      expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      expect(createMovementRecordSpy).toHaveBeenCalledTimes(1)
      expect(
        await movements().findOne({ movementId }, { projection: { _id: 0 } })
      ).toEqual({ movementId, orgId: 'another-org' })
    })
  })

  // Whether the waste is hazardous comes from its waste items' hazardous
  // properties, so callers can't declare it separately.
  it('returns an error when wasteType is sent in the body and does not create a movement', async () => {
    const createMovementRecordSpy = vi.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: { ...goodPayload, wasteType: 'HAZARDOUS' },
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
        message: 'must NOT have additional properties',
        pointer: '/wasteType'
      }
    ])
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('returns an error when a waste item weight is not greater than 0 and does not create a movement', async () => {
    const invalidPayload = {
      producer,
      collectionDateTime,
      collectionSite,
      intendedCarriers,
      intendedReceivers,
      wasteItems: [
        {
          ...wasteItem,
          physicalDetails: {
            ...wasteItem.physicalDetails,
            totalWeight: { ...wasteItem.physicalDetails.totalWeight, amount: 0 }
          }
        }
      ]
    }
    const createMovementRecordSpy = vi.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
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
        errorType: 'OutOfRange',
        message: 'must be > 0',
        pointer: '/wasteItems/0/physicalDetails/totalWeight/amount'
      }
    ])

    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  // Treatments are part of the shared waste item, but creating a movement
  // doesn't take them yet.
  it('returns an error when a waste item declares treatments and does not create a movement', async () => {
    const invalidPayload = {
      producer,
      collectionDateTime,
      collectionSite,
      intendedCarriers,
      intendedReceivers,
      wasteItems: [{ ...wasteItem, treatments: [treatment] }]
    }
    const createMovementRecordSpy = vi.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toEqual([
      expect.objectContaining({
        errorType: 'NotAllowed',
        pointer: '/wasteItems/0/treatments'
      })
    ])
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('rejects when no organisation was forwarded (unknown or disabled API code) and does not create a movement', async () => {
    const invalidPayload = {
      producer,
      collectionDateTime,
      collectionSite,
      intendedCarriers,
      intendedReceivers,
      wasteItems
    }
    const createMovementRecordSpy = vi.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(result).toEqual({
      detail: 'the API Code supplied is invalid',
      instance: '/beta-3/movements',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('should return 401 when request is unauthenticated', async () => {
    const createMovementRecordSpy = vi.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(result).toEqual({
      detail: 'Missing authentication',
      instance: `/${endpointVersion}/movements`,
      title: 'Unauthorized',
      type: `${expectedTypeBase}unauthorized`,
      requestId: traceId
    })
    expect(statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED)
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('returns a 500 when the response body does not match the response schema', async () => {
    vi.mocked(createMovementId).mockResolvedValueOnce(12345)
    vi.spyOn(movementCreate, 'createMovementRecord').mockResolvedValueOnce(
      goodPayload
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      instance: `/${endpointVersion}/movements`,
      title: 'Internal Server Error',
      type: `${expectedTypeBase}internal-server-error`,
      requestId: traceId
    })
  })

  // ajv checks a oneOf value against every branch, so a value of the wrong
  // type used to be reported once per branch (12 errors for a string
  // producer). It must be reported once, at its own pointer.
  describe('reports a value of the wrong type once', () => {
    it.each([
      {
        description: 'producer',
        payload: {
          producer: 'fail',
          collectionDateTime,
          collectionSite,
          intendedCarriers: [carrier],
          intendedReceivers,
          wasteItems
        }
      },
      {
        description: 'brokerOrDealer',
        payload: {
          producer,
          brokerOrDealer: 'fail',
          collectionDateTime,
          collectionSite,
          intendedCarriers: [carrier],
          intendedReceivers,
          wasteItems
        }
      }
    ])(
      'when $description is not an object',
      async ({ description, payload }) => {
        const createMovementRecordSpy = vi.spyOn(
          movementCreate,
          'createMovementRecord'
        )

        const { statusCode, result } = await server.inject({
          method: 'POST',
          url: `/${endpointVersion}/movements`,
          payload,
          headers: {
            'x-cdp-request-id': traceId,
            Authorization: `Basic ${requestBasicAuthTest1}`,
            ...organisationHeaders
          }
        })

        expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
        expect(result.errors).toEqual([
          {
            errorType: 'InvalidType',
            message: 'must be object',
            pointer: `/${description}`
          }
        ])
        expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
      }
    )
  })

  // Collapsing a wrong-type value only drops errors at or below *that*
  // value: an error deeper in the payload keeps its full pointer.
  describe('points a deeply nested error at the field itself', () => {
    const brokerOrDealerEntry = {
      organisationName: 'Broker Demo Ltd',
      registrationNumber: 'CBDU654321',
      contactDetails: { emailAddress: 'broker@example.com' }
    }
    const withBrokerOrDealerEntry = (entry) => ({
      producer,
      brokerOrDealer: {
        isPresent: true,
        items: [{ ...brokerOrDealerEntry, ...entry }]
      },
      collectionDateTime,
      collectionSite,
      intendedCarriers: [carrier],
      intendedReceivers,
      wasteItems
    })

    it.each([
      {
        description: 'a nested field has an invalid format',
        payload: withBrokerOrDealerEntry({
          contactDetails: { emailAddress: 'not-an-email' }
        }),
        expectedError: {
          errorType: 'InvalidFormat',
          message: "must match format 'email'",
          pointer: '/brokerOrDealer/items/0/contactDetails/emailAddress'
        }
      },
      {
        description: 'a nested field has the wrong type',
        payload: withBrokerOrDealerEntry({
          address: { fullAddress: '2 Broker Yard', postcode: 5 }
        }),
        expectedError: {
          errorType: 'InvalidType',
          message: 'must be string',
          pointer: '/brokerOrDealer/items/0/address/postcode'
        }
      },
      {
        description: 'a nested object has the wrong type',
        payload: withBrokerOrDealerEntry({ contactDetails: 'not-an-object' }),
        expectedError: {
          errorType: 'InvalidType',
          message: 'must be object',
          pointer: '/brokerOrDealer/items/0/contactDetails'
        }
      }
    ])('when $description', async ({ payload, expectedError }) => {
      const { statusCode, result } = await server.inject({
        method: 'POST',
        url: `/${endpointVersion}/movements`,
        payload,
        headers: {
          'x-cdp-request-id': traceId,
          Authorization: `Basic ${requestBasicAuthTest1}`,
          ...organisationHeaders
        }
      })

      expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(result.errors).toEqual([expectedError])
    })
  })

  // Background: they are authenticated and have a valid API Code.
  const submit = (payload) =>
    server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

  const withWasteItems = (items, extra = {}) => ({
    ...goodPayload,
    wasteItems: items,
    ...extra
  })
  const expectCreated = async (payload) => {
    const createMovementRecordSpy = vi
      .spyOn(movementCreate, 'createMovementRecord')
      .mockResolvedValue(payload)

    const { statusCode, result } = await submit(payload)

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result.data).toEqual({ movementId: expect.any(String) })
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(1)
  }

  const expectRejected = async (payload, errors) => {
    const createMovementRecordSpy = vi.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await submit(payload)

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toEqual(errors)
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  }

  const reasonRequired = {
    errorType: 'NotProvided',
    message:
      "Required when a waste item declares hazardous properties and 'code' is not provided",
    pointer: '/consignmentNote/reasonForNoCode'
  }
  const consignmentNoteRequired = {
    errorType: 'NotProvided',
    message:
      "Required when a waste item declares hazardous properties, with a 'code' or a 'reasonForNoCode'",
    pointer: '/consignmentNote'
  }

  describe('Feature: Describing the waste when creating a waste movement', () => {
    // Every classification declares its POPs and hazardous properties; these
    // scenarios aren't about them, so it's always none unless the test says
    // otherwise.
    const withClassification = (classification) =>
      withWasteItems([
        {
          ...wasteItem,
          classification: { pops, hazardous, ...classification }
        }
      ])

    const reasonForNoCode = 'Carrier did not provide a consignment note'

    // A code that isn't six digits fails the schema; a six-digit code that
    // isn't in the reference data fails the check in
    // waste-reference-data-checks.js.
    const ewcCodeBadlyFormatted = (pointer) => ({
      errorType: 'InvalidFormat',
      message: "must match pattern '^\\d{6}$'",
      pointer
    })
    const ewcCodeNotRecognised = (pointer) => ({
      errorType: 'InvalidValue',
      message: 'must be a recognised EWC code',
      pointer
    })

    describe('Scenario: A Movement is created when non-hazardous waste is described without a consignment code', () => {
      it('creates the movement for a waste description and a non-hazardous EWC code', async () => {
        await expectCreated(
          withClassification({
            wasteDescription: 'Paper and cardboard',
            ewcCodes: ['200101']
          })
        )
      })
    })

    describe('Scenario: A Movement is created when a consignment code is given for non-hazardous waste', () => {
      it('creates the movement for a non-hazardous EWC code and a valid consignment code', async () => {
        await expectCreated({ ...goodPayload, consignmentNote })
      })
    })

    describe('Scenario: A Movement is created when a mirror EWC code is provided', () => {
      it.each([
        ['1 EWC code', ['170504']],
        ['2 EWC codes', ['170504', '191212']],
        ['5 EWC codes', ['170504', '191212', '170904', '170604', '200101']]
      ])('creates the movement with %s', async (_, ewcCodes) => {
        await expectCreated(
          withClassification({ wasteDescription: 'Soil and stones', ewcCodes })
        )
      })
    })

    describe("Scenario Outline: A Movement isn't created when the waste description is missing", () => {
      it('rejects a waste description that is not provided as required', async () => {
        await expectRejected(withClassification({ ewcCodes: ['200101'] }), [
          {
            errorType: 'NotProvided',
            message: "'wasteDescription' is required",
            pointer: '/wasteItems/0/classification/wasteDescription'
          }
        ])
      })

      it('rejects a waste description of ""', async () => {
        await expectRejected(
          withClassification({ wasteDescription: '', ewcCodes: ['200101'] }),
          [
            {
              errorType: 'OutOfRange',
              message: 'must NOT have fewer than 1 characters',
              pointer: '/wasteItems/0/classification/wasteDescription'
            }
          ]
        )
      })
    })

    describe("Scenario Outline: A Movement isn't created when the EWC code is missing or invalid", () => {
      const description = { wasteDescription: 'Paper and cardboard' }

      // Examples: Not provided or empty
      it('rejects EWC codes that are not provided as required', async () => {
        await expectRejected(withClassification(description), [
          {
            errorType: 'NotProvided',
            message: "'ewcCodes' is required",
            pointer: '/wasteItems/0/classification/ewcCodes'
          }
        ])
      })

      // "" isn't six digits, so it's reported as a format error.
      it('rejects an EWC code of ""', async () => {
        await expectRejected(
          withClassification({ ...description, ewcCodes: [''] }),
          [ewcCodeBadlyFormatted('/wasteItems/0/classification/ewcCodes/0')]
        )
      })

      // Examples: Not recognised
      it.each(['2001', '200101*', '20 01 01'])(
        'rejects an EWC code of %p as not in the recognised format',
        async (code) => {
          await expectRejected(
            withClassification({ ...description, ewcCodes: [code] }),
            [ewcCodeBadlyFormatted('/wasteItems/0/classification/ewcCodes/0')]
          )
        }
      )

      it('rejects an EWC code of "999999" as not recognised', async () => {
        await expectRejected(
          withClassification({ ...description, ewcCodes: ['999999'] }),
          [ewcCodeNotRecognised('/wasteItems/0/classification/ewcCodes/0')]
        )
      })

      it('reports each unrecognised code on a waste, and only those', async () => {
        await expectRejected(
          withClassification({
            ...description,
            ewcCodes: ['200101', '999999', '200301', '999998']
          }),
          [
            ewcCodeNotRecognised('/wasteItems/0/classification/ewcCodes/1'),
            ewcCodeNotRecognised('/wasteItems/0/classification/ewcCodes/3')
          ]
        )
      })

      it('rejects an empty list of EWC codes', async () => {
        await expectRejected(
          withClassification({ ...description, ewcCodes: [] }),
          [
            {
              errorType: 'OutOfRange',
              message: 'must NOT have fewer than 1 items',
              pointer: '/wasteItems/0/classification/ewcCodes'
            }
          ]
        )
      })
    })

    describe("Scenario: A Movement isn't created when more than 5 EWC codes are declared", () => {
      it('rejects 6 EWC codes, saying no more than 5 are permitted', async () => {
        await expectRejected(
          withClassification({
            wasteDescription: 'Soil and stones',
            ewcCodes: [
              '170504',
              '191212',
              '170904',
              '170604',
              '200101',
              '200301'
            ]
          }),
          [
            {
              errorType: 'OutOfRange',
              message: 'must NOT have more than 5 items',
              pointer: '/wasteItems/0/classification/ewcCodes'
            }
          ]
        )
      })
    })

    describe('Scenario Outline: A Movement is created when hazardous waste has a consignment code', () => {
      it.each([
        ['EA / NRW', 'SMITHS/A1234'],
        ['SEPA', 'SA1234567'],
        ['NIEA', 'DA1234567']
      ])('creates the movement with a %s code of %s', async (_, code) => {
        await expectCreated(
          withWasteItems([hazardousWasteItem], { consignmentNote: { code } })
        )
      })
    })

    describe('Scenario: A Movement is created when hazardous waste has a reason for no consignment code', () => {
      it('creates the movement with a hazardous EWC code and a reason', async () => {
        await expectCreated(
          withWasteItems([hazardousWasteItem], {
            consignmentNote: { reasonForNoCode }
          })
        )
      })
    })

    describe("Scenario: A Movement isn't created when hazardous waste has neither a consignment code nor a reason", () => {
      it('rejects a code and a reason that are not provided, saying a reason is required', async () => {
        await expectRejected(
          withWasteItems([hazardousWasteItem], { consignmentNote: {} }),
          [reasonRequired]
        )
      })

      it('rejects a movement with no consignment note at all, saying a code or a reason is required', async () => {
        await expectRejected(withWasteItems([hazardousWasteItem]), [
          consignmentNoteRequired
        ])
      })
    })

    describe("Scenario: A Movement isn't created when any one of several wastes is hazardous and has neither a consignment code nor a reason", () => {
      it('rejects one hazardous and one non-hazardous waste with no consignment code or reason', async () => {
        await expectRejected(
          withWasteItems([wasteItem, hazardousWasteItem], {
            consignmentNote: {}
          }),
          [reasonRequired]
        )
      })
    })

    describe("Scenario Outline: A Movement isn't created when the reason for no consignment code is null or empty", () => {
      it.each([
        ['""', '', 'OutOfRange', 'must NOT have fewer than 1 characters'],
        ['null', null, 'InvalidType', 'must be string']
      ])(
        'rejects a reason of %s rather than reading it as not provided',
        async (_, reasonForNoCode, errorType, message) => {
          await expectRejected(
            withWasteItems([hazardousWasteItem], {
              consignmentNote: { reasonForNoCode }
            }),
            [
              {
                errorType,
                message,
                pointer: '/consignmentNote/reasonForNoCode'
              }
            ]
          )
        }
      )
    })

    describe("Scenario Outline: A Movement isn't created when the consignment code is invalid", () => {
      it.each(['12345', 'ABC/123', 'SD1234567'])(
        'rejects a consignment code of %p as not in a recognised format',
        async (code) => {
          await expectRejected(
            withWasteItems([hazardousWasteItem], { consignmentNote: { code } }),
            [
              {
                errorType: 'InvalidFormat',
                message: expect.stringMatching(/^must match pattern /),
                pointer: '/consignmentNote/code'
              }
            ]
          )
        }
      )
    })

    describe("Scenario: A Movement isn't created when both a consignment code and a reason are given", () => {
      it('rejects the reason as not permitted', async () => {
        await expectRejected(
          withWasteItems([hazardousWasteItem], {
            consignmentNote: { ...consignmentNote, reasonForNoCode }
          }),
          [
            {
              errorType: 'NotAllowed',
              message: "Not allowed when 'code' is provided",
              pointer: '/consignmentNote/reasonForNoCode'
            }
          ]
        )
      })
    })

    describe("Scenario: A Movement isn't created when any one of several wastes is described with missing or invalid details", () => {
      it('reports each invalid detail against the waste it belongs to', async () => {
        await expectRejected(
          withWasteItems([
            wasteItem,
            {
              ...wasteItem,
              classification: { ewcCodes: ['999999'], pops, hazardous }
            }
          ]),
          [
            {
              errorType: 'NotProvided',
              message: "'wasteDescription' is required",
              pointer: '/wasteItems/1/classification/wasteDescription'
            },
            ewcCodeNotRecognised('/wasteItems/1/classification/ewcCodes/0')
          ]
        )
      })
    })
  })

  describe('Feature: Declaring the hazardous properties of the waste', () => {
    const withHazardous = (hazardous, extra) =>
      withWasteItems(
        [
          {
            ...wasteItem,
            classification: { ...wasteItem.classification, hazardous }
          }
        ],
        extra
      )
    // Hazardous waste needs a consignment note, which these scenarios
    // aren't about.
    const withHazardousProperties = (hazardous) =>
      withHazardous(hazardous, { consignmentNote })

    const { codes: _, ...withoutCodes } = hazardousPresent

    const hazardousPointer = '/wasteItems/0/classification/hazardous'
    const codesPointer = `${hazardousPointer}/codes`
    const componentsPointer = `${hazardousPointer}/components`
    const quoted = (code) => `'${code}'`
    const hpCodes = [
      'HP_1',
      'HP_2',
      'HP_3',
      'HP_4',
      'HP_5',
      'HP_6',
      'HP_7',
      'HP_8',
      'HP_9',
      'HP_10',
      'HP_11',
      'HP_12',
      'HP_13',
      'HP_14',
      'HP_15',
      'HP_POP'
    ]
    const codeNotRecognised = (pointer) => ({
      errorType: 'InvalidValue',
      message: `must be one of: ${hpCodes.map(quoted).join(', ')}`,
      pointer
    })

    describe('Scenario: A Movement is created when the waste is declared as having no hazardous properties', () => {
      it('creates the movement', async () => {
        await expectCreated(withHazardous({ isPresent: false }))
      })
    })

    describe('Scenario Outline: A Movement is created when hazardous properties are declared', () => {
      it.each([[['HP_4']], [['HP_4', 'HP_8']]])(
        'creates the movement with codes %p',
        async (codes) => {
          await expectCreated(
            withHazardousProperties({ ...hazardousPresent, codes })
          )
        }
      )
    })

    describe("Scenario Outline: A Movement isn't created when whether the waste has hazardous properties is missing or invalid", () => {
      it('rejects whether the waste has hazardous properties not being provided, as required', async () => {
        await expectRejected(withHazardous({}), [
          {
            errorType: 'NotProvided',
            message: "'isPresent' is required",
            pointer: `${hazardousPointer}/isPresent`
          }
        ])
      })

      // "" isn't true or false either.
      it.each(['', 'Maybe', 'Unknown'])(
        'rejects whether the waste has hazardous properties of %p as not true or false',
        async (isPresent) => {
          await expectRejected(withHazardous({ isPresent }), [
            {
              errorType: 'InvalidType',
              message: 'must be boolean',
              pointer: `${hazardousPointer}/isPresent`
            }
          ])
        }
      )

      it('rejects hazardous properties not being declared at all', async () => {
        const { hazardous: _, ...withoutHazardous } = wasteItem.classification
        await expectRejected(
          withWasteItems([{ ...wasteItem, classification: withoutHazardous }]),
          [
            {
              errorType: 'NotProvided',
              message: "'hazardous' is required",
              pointer: hazardousPointer
            }
          ]
        )
      })
    })

    describe("Scenario Outline: A Movement isn't created when the waste has hazardous properties but the codes are missing or invalid", () => {
      it('rejects codes not being provided, saying they are required', async () => {
        await expectRejected(withHazardousProperties(withoutCodes), [
          {
            errorType: 'NotProvided',
            message: "Required when 'isPresent' is true",
            pointer: codesPointer
          }
        ])
      })

      it('rejects an empty list of codes, saying at least one is required', async () => {
        await expectRejected(
          withHazardousProperties({ ...hazardousPresent, codes: [] }),
          [
            {
              errorType: 'OutOfRange',
              message: 'must NOT have fewer than 1 items',
              pointer: codesPointer
            }
          ]
        )
      })

      it('rejects codes of "" as not a list', async () => {
        await expectRejected(
          withHazardousProperties({ ...hazardousPresent, codes: '' }),
          [
            {
              errorType: 'InvalidType',
              message: 'must be array',
              pointer: codesPointer
            }
          ]
        )
      })

      it.each(['HP_22', 'Flammable'])(
        'rejects a code of %p as not recognised',
        async (code) => {
          await expectRejected(
            withHazardousProperties({ ...hazardousPresent, codes: [code] }),
            [codeNotRecognised(`${codesPointer}/0`)]
          )
        }
      )

      it('reports each unrecognised code against that code', async () => {
        await expectRejected(
          withHazardousProperties({
            ...hazardousPresent,
            codes: ['HP01', 'HP_99']
          }),
          [
            codeNotRecognised(`${codesPointer}/0`),
            codeNotRecognised(`${codesPointer}/1`)
          ]
        )
      })
    })

    describe("Scenario: A Movement isn't created when codes are given for waste declared as having no hazardous properties", () => {
      it('rejects the codes as not permitted', async () => {
        await expectRejected(
          withHazardous({ isPresent: false, codes: ['HP_4'] }),
          [
            {
              errorType: 'NotAllowed',
              message: "Not allowed unless 'isPresent' is true",
              pointer: codesPointer
            }
          ]
        )
      })
    })

    describe("Scenario: A Movement isn't created when several wastes declare invalid hazardous properties", () => {
      it('reports each invalid declaration against the waste it belongs to', async () => {
        const withDeclaration = (hazardous) => ({
          ...wasteItem,
          classification: { ...wasteItem.classification, hazardous }
        })
        await expectRejected(
          withWasteItems(
            [
              withDeclaration({ isPresent: 'Maybe' }),
              withDeclaration({ ...hazardousPresent, codes: ['HP_99'] })
            ],
            { consignmentNote }
          ),
          [
            {
              errorType: 'InvalidType',
              message: 'must be boolean',
              pointer: '/wasteItems/0/classification/hazardous/isPresent'
            },
            codeNotRecognised('/wasteItems/1/classification/hazardous/codes/0')
          ]
        )
      })
    })

    describe('Scenario Outline: A Movement is created when hazardous components are declared', () => {
      it.each([
        [[hazardousComponent]],
        [[{ name: 'Lead compounds', threshold: 'GREATER_THAN' }]],
        [
          [
            hazardousComponent,
            { name: 'Lead compounds', threshold: 'EQUAL_TO' }
          ]
        ]
      ])('creates the movement with components %j', async (components) => {
        await expectCreated(
          withHazardousProperties({ ...hazardousPresent, components })
        )
      })
    })

    describe('Scenario: A Movement is created when no hazardous components need reporting', () => {
      it('creates the movement with a source and no components', async () => {
        const { components: _, ...withoutComponents } = hazardousPresent
        await expectCreated(
          withHazardousProperties({
            ...withoutComponents,
            isComponentsNotApplicable: true
          })
        )
      })
    })

    describe("Scenario: A Movement isn't created when hazardous details are given for waste declared as having no hazardous properties", () => {
      it('rejects each detail as not permitted', async () => {
        const notAllowed = (field) => ({
          errorType: 'NotAllowed',
          message: "Not allowed unless 'isPresent' is true",
          pointer: `${hazardousPointer}/${field}`
        })
        await expectRejected(
          withHazardous({ ...hazardousPresent, isPresent: false }),
          [
            notAllowed('codes'),
            notAllowed('componentsSource'),
            notAllowed('isComponentsNotApplicable'),
            notAllowed('components')
          ]
        )
      })
    })

    describe("Scenario: A Movement isn't created when the waste is hazardous but neither components nor not applicable are declared", () => {
      it('rejects no components, saying they are required', async () => {
        const { components: _, ...withoutComponents } = hazardousPresent
        await expectRejected(withHazardousProperties(withoutComponents), [
          {
            errorType: 'NotProvided',
            message: "Required when 'isComponentsNotApplicable' is false",
            pointer: componentsPointer
          }
        ])
      })

      it('rejects the source not being provided, saying it is required', async () => {
        const { componentsSource: _, ...withoutSource } = hazardousPresent
        await expectRejected(withHazardousProperties(withoutSource), [
          {
            errorType: 'NotProvided',
            message: "Required when 'isPresent' is true",
            pointer: `${hazardousPointer}/componentsSource`
          }
        ])
      })
    })

    describe("Scenario: A Movement isn't created when components are given although declared not applicable", () => {
      it('rejects the components as not permitted', async () => {
        await expectRejected(
          withHazardousProperties({
            ...hazardousPresent,
            isComponentsNotApplicable: true
          }),
          [
            {
              errorType: 'NotAllowed',
              message: "Not allowed when 'isComponentsNotApplicable' is true",
              pointer: componentsPointer
            }
          ]
        )
      })
    })

    describe("Scenario: A Movement isn't created when any one of several hazardous components is declared with missing or invalid details", () => {
      it('reports each invalid detail against the component it belongs to', async () => {
        await expectRejected(
          withHazardousProperties({
            ...hazardousPresent,
            components: [
              hazardousComponent,
              { name: 'Arsenic', unit: 'MG_PER_KG', amount: 0 },
              { threshold: 'LESS_THAN' }
            ]
          }),
          [
            {
              errorType: 'OutOfRange',
              message: 'must be > 0',
              pointer: `${componentsPointer}/1/amount`
            },
            {
              errorType: 'NotProvided',
              message: "'name' is required",
              pointer: `${componentsPointer}/2/name`
            },
            {
              errorType: 'InvalidValue',
              message: "must be one of: 'EQUAL_TO', 'GREATER_THAN'",
              pointer: `${componentsPointer}/2/threshold`
            }
          ]
        )
      })
    })

    describe('Scenario: A Movement is created without a consignment note when a hazardous EWC code is declared as having no hazardous properties', () => {
      it('creates the movement for fluorescent tubes declared as not hazardous', async () => {
        await expectCreated(
          withWasteItems([
            {
              ...wasteItem,
              classification: {
                ...hazardousWasteItem.classification,
                hazardous: { isPresent: false }
              }
            }
          ])
        )
      })
    })

    describe("Scenario: A Movement isn't created without a consignment note when a non-hazardous EWC code is declared as having hazardous properties", () => {
      it('rejects the movement, saying a consignment note is required', async () => {
        await expectRejected(
          withHazardous({ ...hazardousPresent, codes: ['HP_4'] }),
          [consignmentNoteRequired]
        )
      })
    })

    describe('Scenario: The declared hazardous properties are stored with the movement', () => {
      it("stores each waste item's declaration", async () => {
        // Earlier tests stub createMovementRecord; this one needs the real write.
        vi.spyOn(movementCreate, 'createMovementRecord').mockRestore()
        vi.mocked(createMovementId).mockResolvedValueOnce('26HAZ001')

        const { statusCode } = await submit(
          withHazardousProperties({
            ...hazardousPresent,
            codes: ['HP_4', 'HP_8']
          })
        )

        expect(statusCode).toEqual(HTTP_STATUS.CREATED)
        const recordInDb = await server.db
          .collection(collectionName('movements'))
          .findOne({ movementId: '26HAZ001' })

        expect(recordInDb.wasteItems[0].classification.hazardous).toEqual({
          ...hazardousPresent,
          codes: ['HP_4', 'HP_8']
        })
      })
    })
  })

  describe('Feature: Declare where and when the waste will be collected', () => {
    // Background: authenticated, with a valid API Code — every request here
    // sends the basic auth and organisation headers.
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

    describe('Scenario: A Movement is created with valid collection site details', () => {
      it('creates the movement with a valid planned collection date and time, a collection address and contact details', async () => {
        await expectCreated(goodPayload)
      })
    })

    describe("Scenario: A Movement isn't created without a planned collection date and time", () => {
      it('rejects the movement, saying the planned collection date and time is required', async () => {
        await expectRejected(without('collectionDateTime', goodPayload), [
          notProvided('collectionDateTime', '/collectionDateTime')
        ])
      })
    })

    describe("Scenario Outline: A Movement isn't created without a collection address", () => {
      it('rejects a collection site with no address, saying the address is required', async () => {
        await expectRejected(
          withCollectionSite(without('address', collectionSite)),
          [notProvided('address', '/collectionSite/address')]
        )
      })

      it('rejects a movement with no collection site, saying it is required', async () => {
        await expectRejected(without('collectionSite', goodPayload), [
          notProvided('collectionSite', '/collectionSite')
        ])
      })
    })

    describe("Scenario: A Movement isn't created without a collection contact detail", () => {
      it('rejects a valid collection address with no contact details, saying they are required', async () => {
        await expectRejected(
          withCollectionSite(without('contactDetails', collectionSite)),
          [notProvided('contactDetails', '/collectionSite/contactDetails')]
        )
      })
    })

    describe("Scenario: A Movement isn't created when a planned collection date and time is invalid", () => {
      it.each([
        ['2026-01-15'],
        ['09:30:00'],
        ['15/01/2026 09:30'],
        ['2026-01-15T09:30:00'],
        ['not-a-date']
      ])('rejects a planned collection date and time of %j', async (value) => {
        await expectRejected({ ...goodPayload, collectionDateTime: value }, [
          {
            errorType: 'InvalidFormat',
            message: "must match format 'date-time'",
            pointer: '/collectionDateTime'
          }
        ])
      })
    })

    describe("Scenario: A Movement isn't created when a collection contact detail is invalid", () => {
      it('rejects an invalid collection email address', async () => {
        await expectRejected(
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

      it('rejects an invalid collection phone number', async () => {
        await expectRejected(
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

      it('rejects both an invalid email address and phone number, reporting each', async () => {
        await expectRejected(
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

    describe("Scenario: A Movement isn't created when the collection postcode is invalid", () => {
      it.each([['NOT A POSTCODE'], ['12345'], ['TE1']])(
        'rejects a collection postcode of %j',
        async (postcode) => {
          await expectRejected(
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
