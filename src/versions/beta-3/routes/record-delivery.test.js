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
  supportingReference,
  carrier,
  deliveryDateTime,
  deliverySite,
  hazardousWasteItem,
  wasteItem
} from '../schemas/test-helpers.js'
import { createDeliveryId } from '#/common/http/waste-tracking.js'
import { collectionName, version } from '../index.js'

const { apiVersion } = version

const delivery = version.deliveries

const backoffOptionsConfig = vi.hoisted(() => ({
  numOfAttempts: 3,
  startingDelay: 1
}))

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

describe(`POST /${apiVersion}/deliveries`, () => {
  let server
  const movementId1 = '25HRA0B1'
  const movementId2 = '25HRA0B2'
  const url = `/${apiVersion}/deliveries`
  const deliveryDetails = { carrier, deliveryDateTime, deliverySite }
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

  beforeAll(async () => {
    process.env.ACCESS_CRED_TEST1 = userBasicAuthTest1

    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    // Some tests stub the delivery service; the rest need the real one.
    vi.spyOn(delivery, 'createDeliveryRecords').mockRestore()
    await server.db.collection(collectionName('movements')).deleteMany({})
    await server.db.collection(collectionName('deliveries')).deleteMany({})
  })

  it('records a delivery and returns 201 with the envelope shape', async () => {
    await server.db
      .collection(collectionName('movements'))
      .insertMany([{ movementId: movementId1 }, { movementId: movementId2 }])

    const { statusCode, result, headers } = await server.inject({
      method: 'POST',
      url,
      payload: {
        movementIds: [movementId1, movementId2],
        ...deliveryDetails
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: {
        deliveries: [
          {
            deliveryId: '25KMT4Z9',
            movementIds: [movementId1, movementId2],
            wasteType: 'NON_HAZARDOUS'
          }
        ]
      },
      validation: { warnings: [] }
    })
    expect(headers['x-request-id']).toBeDefined()

    const recordInDb = await server.db
      .collection(collectionName('deliveries'))
      .findOne({ deliveryId: '25KMT4Z9' })

    expect(recordInDb).toMatchObject({
      deliveryId: '25KMT4Z9',
      movementIds: [movementId1, movementId2],
      wasteType: 'NON_HAZARDOUS',
      orgId: forwardedOrganisationId
    })
  })

  it('records a delivery when supportingReferences are provided', async () => {
    await server.db
      .collection(collectionName('movements'))
      .insertOne({ movementId: movementId1 })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        movementIds: [movementId1],
        ...deliveryDetails,
        supportingReferences: [supportingReference]
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result.data.deliveries).toHaveLength(1)
  })

  it('returns a 400 when a supportingReference has an unrecognised label', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        movementIds: [movementId1],
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

  it('echoes the inbound x-cdp-request-id as x-request-id', async () => {
    await server.db
      .collection(collectionName('movements'))
      .insertOne({ movementId: movementId1 })

    const { headers } = await server.inject({
      method: 'POST',
      url,
      payload: { movementIds: [movementId1], ...deliveryDetails },
      headers: tracedAuthHeaders
    })

    expect(headers['x-request-id']).toBe('trace-id-123')
  })

  it('returns a 400 when required fields are missing', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {},
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '4 validation errors occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: "'movementIds' is required",
          pointer: '/movementIds'
        },
        {
          errorType: 'NotProvided',
          message: "'carrier' is required",
          pointer: '/carrier'
        },
        {
          errorType: 'NotProvided',
          message: "'deliveryDateTime' is required",
          pointer: '/deliveryDateTime'
        },
        {
          errorType: 'NotProvided',
          message: "'deliverySite' is required",
          pointer: '/deliverySite'
        }
      ],
      instance: `/${apiVersion}/deliveries`,
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 400 when carrier is missing', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { movementIds: [movementId1], deliveryDateTime, deliverySite },
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
      instance: `/${apiVersion}/deliveries`,
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  describe('delivery details', () => {
    const withoutAddressField = (field) => {
      const { [field]: excluded, ...address } = deliverySite.address
      return { ...deliverySite, address }
    }
    const withoutSiteField = (field) => {
      const { [field]: excluded, ...site } = deliverySite
      return site
    }
    const withoutDetail = (field) => {
      const { [field]: excluded, ...details } = deliveryDetails
      return details
    }

    beforeEach(async () => {
      await server.db
        .collection(collectionName('movements'))
        .insertOne({ movementId: movementId1 })
    })

    it.each([
      ['all the delivery details', deliveryDetails],
      [
        'no full address',
        {
          ...deliveryDetails,
          deliverySite: withoutAddressField('fullAddress')
        }
      ],
      [
        'no regulatory position statement',
        { ...deliveryDetails, deliverySite: withoutSiteField('rpsNumbers') }
      ]
    ])('records a delivery with %s', async (_, details) => {
      const { statusCode, result } = await server.inject({
        method: 'POST',
        url,
        payload: { movementIds: [movementId1], ...details },
        headers: tracedAuthHeaders
      })

      expect(statusCode).toEqual(HTTP_STATUS.CREATED)
      expect(result.data.deliveries).toEqual([
        {
          deliveryId: '25KMT4Z9',
          movementIds: [movementId1],
          wasteType: 'NON_HAZARDOUS'
        }
      ])
    })

    it.each([
      [
        'date and time delivered is not provided',
        withoutDetail('deliveryDateTime'),
        {
          errorType: 'NotProvided',
          message: "'deliveryDateTime' is required",
          pointer: '/deliveryDateTime'
        }
      ],
      [
        'site name is not provided',
        {
          ...deliveryDetails,
          deliverySite: withoutSiteField('organisationName')
        },
        {
          errorType: 'NotProvided',
          message: "'organisationName' is required",
          pointer: '/deliverySite/organisationName'
        }
      ],
      [
        'postcode is not provided',
        { ...deliveryDetails, deliverySite: withoutAddressField('postcode') },
        {
          errorType: 'NotProvided',
          message: "'postcode' is required",
          pointer: '/deliverySite/address/postcode'
        }
      ],
      [
        'date and time delivered is empty',
        { ...deliveryDetails, deliveryDateTime: '' },
        {
          errorType: 'InvalidFormat',
          message: "must match format 'date-time'",
          pointer: '/deliveryDateTime'
        }
      ],
      [
        'site name is empty',
        {
          ...deliveryDetails,
          deliverySite: { ...deliverySite, organisationName: '' }
        },
        {
          errorType: 'OutOfRange',
          message: 'must NOT have fewer than 1 characters',
          pointer: '/deliverySite/organisationName'
        }
      ],
      [
        'postcode is empty',
        {
          ...deliveryDetails,
          deliverySite: { ...deliverySite, address: { postcode: '' } }
        },
        expect.objectContaining({
          errorType: 'InvalidFormat',
          pointer: '/deliverySite/address/postcode'
        })
      ],
      [
        'date and time delivered is not recognised',
        { ...deliveryDetails, deliveryDateTime: '14:30-12-12-25' },
        {
          errorType: 'InvalidFormat',
          message: "must match format 'date-time'",
          pointer: '/deliveryDateTime'
        }
      ],
      [
        'postcode W$12 2GQ is not recognised',
        {
          ...deliveryDetails,
          deliverySite: { ...deliverySite, address: { postcode: 'W$12 2GQ' } }
        },
        expect.objectContaining({
          errorType: 'InvalidFormat',
          pointer: '/deliverySite/address/postcode'
        })
      ],
      [
        'postcode WS12 is not recognised',
        {
          ...deliveryDetails,
          deliverySite: { ...deliverySite, address: { postcode: 'WS12' } }
        },
        expect.objectContaining({
          errorType: 'InvalidFormat',
          pointer: '/deliverySite/address/postcode'
        })
      ],
      [
        'regulatory position statement -343 is not greater than 0',
        {
          ...deliveryDetails,
          deliverySite: { ...deliverySite, rpsNumbers: [-343] }
        },
        {
          errorType: 'OutOfRange',
          message: 'must be >= 1',
          pointer: '/deliverySite/rpsNumbers/0'
        }
      ],
      [
        'regulatory position statement RPS123 is not an integer',
        {
          ...deliveryDetails,
          deliverySite: { ...deliverySite, rpsNumbers: ['RPS123'] }
        },
        {
          errorType: 'InvalidType',
          message: 'must be integer',
          pointer: '/deliverySite/rpsNumbers/0'
        }
      ]
    ])('returns a 400 when %s', async (_, details, expectedError) => {
      const { statusCode, result } = await server.inject({
        method: 'POST',
        url,
        payload: { movementIds: [movementId1], ...details },
        headers: tracedAuthHeaders
      })

      expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(result.errors).toEqual([expectedError])
      expect(
        await server.db
          .collection(collectionName('deliveries'))
          .countDocuments()
      ).toEqual(0)
    })
  })

  // apiCode is sent in the x-api-code header and resolved by the
  // external API, so the backend rejects it in the body.
  it('returns a 400 when apiCode is sent in the body', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        apiCode: apiCode1,
        movementIds: [movementId1],
        ...deliveryDetails
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
      instance: `/${apiVersion}/deliveries`,
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 400 when no organisation was forwarded (unknown or disabled API code)', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { movementIds: [movementId1], ...deliveryDetails },
      headers: { ...authHeaders, ...tracedHeaders }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: 'the API Code supplied is invalid',
      instance: `/${apiVersion}/deliveries`,
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 400 when a movementId does not exist', async () => {
    await server.db
      .collection(collectionName('movements'))
      .insertOne({ movementId: movementId1 })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        movementIds: [movementId1, movementId2],
        ...deliveryDetails
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: 'Movement ID(s) not recognised: 25HRA0B2',
      instance: `/${apiVersion}/deliveries`,
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 500 when persistence fails', async () => {
    await server.db
      .collection(collectionName('movements'))
      .insertOne({ movementId: movementId1 })

    vi.spyOn(delivery, 'createDeliveryRecords').mockRejectedValue(
      new Error('Database connection failed')
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { movementIds: [movementId1], ...deliveryDetails },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      instance: `/${apiVersion}/deliveries`,
      title: 'Internal Server Error',
      type: `${expectedTypeBase}internal-server-error`,
      requestId: traceId
    })
  })

  it('returns 401 when unauthenticated', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { movementIds: [movementId1], ...deliveryDetails },
      headers: tracedHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED)
    expect(result).toEqual({
      detail: 'Missing authentication',
      instance: `/${apiVersion}/deliveries`,
      title: 'Unauthorized',
      type: `${expectedTypeBase}unauthorized`,
      requestId: traceId
    })
  })

  it('returns a 500 when the response body does not match the response schema', async () => {
    await server.db
      .collection(collectionName('movements'))
      .insertOne({ movementId: movementId1 })
    // Stubbed so the bad id isn't rejected by the deliveries collection first.
    vi.spyOn(delivery, 'createDeliveryRecords').mockResolvedValueOnce([
      {
        deliveryId: 42,
        movementIds: [movementId1],
        wasteType: 'NON_HAZARDOUS'
      }
    ])

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { movementIds: [movementId1], ...deliveryDetails },
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

  describe('splits the movements by waste type', () => {
    const mintedDeliveryId = '25KMT4Z9'
    const nonHazardous = (...movementIds) => ({
      deliveryId: mintedDeliveryId,
      movementIds,
      wasteType: 'NON_HAZARDOUS'
    })
    const hazardous = (movementId) => ({
      deliveryId: movementId,
      movementIds: [movementId],
      wasteType: 'HAZARDOUS'
    })

    const seedMovements = (nonHazardousIds, hazardousIds) =>
      server.db.collection(collectionName('movements')).insertMany([
        ...nonHazardousIds.map((movementId) => ({
          movementId,
          wasteItems: [wasteItem]
        })),
        ...hazardousIds.map((movementId) => ({
          movementId,
          wasteItems: [hazardousWasteItem]
        }))
      ])

    const findDeliveries = () =>
      server.db
        .collection(collectionName('deliveries'))
        .find({}, { projection: { _id: 0, createdAt: 0 } })
        .toArray()

    it.each([
      {
        nonHazardousIds: ['261B23B4'],
        hazardousIds: [],
        submitted: ['261B23B4'],
        expected: [nonHazardous('261B23B4')],
        nextCalls: 1
      },
      {
        nonHazardousIds: ['261B23B4', '262C34C5'],
        hazardousIds: [],
        submitted: ['261B23B4', '262C34C5'],
        expected: [nonHazardous('261B23B4', '262C34C5')],
        nextCalls: 1
      },
      {
        nonHazardousIds: ['261B23B4'],
        hazardousIds: ['269X8Y7Z'],
        submitted: ['269X8Y7Z', '261B23B4'],
        expected: [nonHazardous('261B23B4'), hazardous('269X8Y7Z')],
        nextCalls: 1
      },
      {
        nonHazardousIds: ['261B23B4', '262C34C5'],
        hazardousIds: ['269X8Y7Z'],
        submitted: ['261B23B4', '269X8Y7Z', '262C34C5'],
        expected: [nonHazardous('261B23B4', '262C34C5'), hazardous('269X8Y7Z')],
        nextCalls: 1
      },
      {
        nonHazardousIds: ['261B23B4', '262C34C5'],
        hazardousIds: ['269X8Y7Z', '268W7X6Y'],
        submitted: ['269X8Y7Z', '261B23B4', '268W7X6Y', '262C34C5'],
        expected: [
          nonHazardous('261B23B4', '262C34C5'),
          hazardous('269X8Y7Z'),
          hazardous('268W7X6Y')
        ],
        nextCalls: 1
      },
      {
        nonHazardousIds: [],
        hazardousIds: ['269X8Y7Z', '268W7X6Y'],
        submitted: ['269X8Y7Z', '268W7X6Y'],
        expected: [hazardous('269X8Y7Z'), hazardous('268W7X6Y')],
        nextCalls: 0
      }
    ])(
      'non-hazardous $nonHazardousIds and hazardous $hazardousIds',
      async ({
        nonHazardousIds,
        hazardousIds,
        submitted,
        expected,
        nextCalls
      }) => {
        await seedMovements(nonHazardousIds, hazardousIds)

        const { statusCode, result } = await server.inject({
          method: 'POST',
          url,
          payload: { movementIds: submitted, ...deliveryDetails },
          headers: tracedAuthHeaders
        })

        expect(statusCode).toEqual(HTTP_STATUS.CREATED)
        expect(result).toEqual({
          data: { deliveries: expected },
          validation: { warnings: [] }
        })
        expect(createDeliveryId).toHaveBeenCalledTimes(nextCalls)
        expect(await findDeliveries()).toEqual(
          expected.map((item) => ({
            ...item,
            orgId: forwardedOrganisationId
          }))
        )
      }
    )

    it('treats a movement as hazardous when any one of its waste items declares hazardous properties', async () => {
      await seedMovements(['261B23B4'], [])
      await server.db.collection(collectionName('movements')).insertOne({
        movementId: '269X8Y7Z',
        wasteItems: [wasteItem, hazardousWasteItem]
      })

      const { statusCode, result } = await server.inject({
        method: 'POST',
        url,
        payload: { movementIds: ['261B23B4', '269X8Y7Z'], ...deliveryDetails },
        headers: tracedAuthHeaders
      })

      expect(statusCode).toEqual(HTTP_STATUS.CREATED)
      expect(result.data.deliveries).toEqual([
        nonHazardous('261B23B4'),
        hazardous('269X8Y7Z')
      ])
    })

    // The declaration decides, not the EWC codes.
    describe('decides by the declared hazardous properties', () => {
      const withDeclaration = (item, hazardous) => ({
        ...item,
        classification: { ...item.classification, hazardous }
      })
      const deliver = (movementIds) =>
        server.inject({
          method: 'POST',
          url,
          payload: { movementIds, ...deliveryDetails },
          headers: tracedAuthHeaders
        })

      it('delivers a non-hazardous EWC code declared as having hazardous properties on its own', async () => {
        await seedMovements(['261B23B4'], [])
        await server.db.collection(collectionName('movements')).insertOne({
          movementId: '269X8Y7Z',
          wasteItems: [
            withDeclaration(wasteItem, { isPresent: true, codes: ['HP_4'] })
          ]
        })

        const { statusCode, result } = await deliver(['261B23B4', '269X8Y7Z'])

        expect(statusCode).toEqual(HTTP_STATUS.CREATED)
        expect(result.data.deliveries).toEqual([
          nonHazardous('261B23B4'),
          hazardous('269X8Y7Z')
        ])
      })

      it('delivers a hazardous EWC code declared as having no hazardous properties with the non-hazardous movements', async () => {
        await seedMovements(['261B23B4'], [])
        await server.db.collection(collectionName('movements')).insertOne({
          movementId: '262C34C5',
          wasteItems: [
            withDeclaration(hazardousWasteItem, { isPresent: false })
          ]
        })

        const { statusCode, result } = await deliver(['261B23B4', '262C34C5'])

        expect(statusCode).toEqual(HTTP_STATUS.CREATED)
        expect(result.data.deliveries).toEqual([
          nonHazardous('261B23B4', '262C34C5')
        ])
      })
    })

    // Movements created before waste items were stored have no wasteItems.
    it('aggregates a movement stored without waste items as non-hazardous', async () => {
      await seedMovements([], ['269X8Y7Z'])
      await server.db
        .collection(collectionName('movements'))
        .insertOne({ movementId: '261B23B4' })

      const { statusCode, result } = await server.inject({
        method: 'POST',
        url,
        payload: { movementIds: ['269X8Y7Z', '261B23B4'], ...deliveryDetails },
        headers: tracedAuthHeaders
      })

      expect(statusCode).toEqual(HTTP_STATUS.CREATED)
      expect(result.data.deliveries).toEqual([
        nonHazardous('261B23B4'),
        hazardous('269X8Y7Z')
      ])
    })

    it('delivers a movement ID submitted more than once only once', async () => {
      await seedMovements(['261B23B4'], ['269X8Y7Z'])

      const { statusCode, result } = await server.inject({
        method: 'POST',
        url,
        payload: {
          movementIds: ['261B23B4', '269X8Y7Z', '261B23B4', '269X8Y7Z'],
          ...deliveryDetails
        },
        headers: tracedAuthHeaders
      })

      expect(statusCode).toEqual(HTTP_STATUS.CREATED)
      expect(result.data.deliveries).toEqual([
        nonHazardous('261B23B4'),
        hazardous('269X8Y7Z')
      ])
      expect(await findDeliveries()).toHaveLength(2)
    })

    describe('rejects the request without minting or storing anything', () => {
      beforeEach(() =>
        seedMovements(['261B23B4', '262C34C5'], ['269X8Y7Z', '268W7X6Y'])
      )

      it.each([
        {
          description: 'movementIds is not provided',
          payload: { ...deliveryDetails },
          error: {
            errorType: 'NotProvided',
            message: "'movementIds' is required",
            pointer: '/movementIds'
          }
        },
        {
          description: 'movementIds is an empty string',
          payload: { movementIds: '', ...deliveryDetails },
          error: {
            errorType: 'InvalidType',
            message: 'must be array',
            pointer: '/movementIds'
          }
        },
        {
          description: 'movementIds is an empty list',
          payload: { movementIds: [], ...deliveryDetails },
          error: {
            errorType: 'OutOfRange',
            message: 'must NOT have fewer than 1 items',
            pointer: '/movementIds'
          }
        }
      ])('when $description', async ({ payload, error }) => {
        const { statusCode, result } = await server.inject({
          method: 'POST',
          url,
          payload,
          headers: tracedAuthHeaders
        })

        expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
        expect(result.errors).toEqual([error])
        expect(createDeliveryId).not.toHaveBeenCalled()
        expect(await findDeliveries()).toEqual([])
      })

      it.each([
        { submitted: ['26ZZZZZZ'], unrecognised: '26ZZZZZZ' },
        { submitted: ['269ZZZZZ'], unrecognised: '269ZZZZZ' },
        { submitted: ['261B23B4', '26ZZZZZZ'], unrecognised: '26ZZZZZZ' }
      ])(
        'when $submitted includes an unrecognised movement ID',
        async ({ submitted, unrecognised }) => {
          const { statusCode, result } = await server.inject({
            method: 'POST',
            url,
            payload: { movementIds: submitted, ...deliveryDetails },
            headers: tracedAuthHeaders
          })

          expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
          expect(result.detail).toEqual(
            `Movement ID(s) not recognised: ${unrecognised}`
          )
          expect(createDeliveryId).not.toHaveBeenCalled()
          expect(await findDeliveries()).toEqual([])
        }
      )
    })
  })
})
