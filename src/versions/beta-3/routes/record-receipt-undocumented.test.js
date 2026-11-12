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
  receiptDateTime,
  brokerOrDealerEntry,
  supportingReference,
  carrier,
  consignmentNote,
  hazardous,
  hazardousComponent,
  hazardousPresent,
  hazardousWasteItem,
  pops,
  popComponent,
  popsPresent,
  receiver,
  treatment,
  wasteItem
} from '../schemas/test-helpers.js'
import { createDeliveryId } from '#/common/http/waste-tracking.js'
import { version } from '../index.js'
import { versionedCollections } from '#/common/data/versioned-collections.js'
import { DATA_REVISION } from '../data/revision.js'

const collectionName = versionedCollections('beta-3', DATA_REVISION)

const delivery = version.deliveries

const backoffOptionsConfig = vi.hoisted(() => ({
  numOfAttempts: 3,
  startingDelay: 1
}))
// A receipt needs at least one treatment on every waste item.
const wasteItems = [{ ...wasteItem, treatments: [treatment] }]
const reasonForNoDeliveryId =
  'No delivery was recorded prior to receipt; waste received directly from the producer.'

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

describe('POST /beta-3/receipts', () => {
  let server
  const url = '/beta-3/receipts'
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
    await server.db.collection(collectionName('deliveries')).deleteMany({})
  })

  it('mints an empty delivery, acknowledges receipt against it and returns 201 with the envelope shape', async () => {
    const { statusCode, result, headers } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        reasonForNoDeliveryId,
        carrier,
        receiver,
        wasteItems
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { deliveryId: '25KMT4Z9' },
      validation: { warnings: [] }
    })
    expect(headers['x-request-id']).toBeDefined()

    const deliveryInDb = await server.db
      .collection(collectionName('deliveries'))
      .findOne({ deliveryId: '25KMT4Z9' })

    expect(deliveryInDb).toMatchObject({
      deliveryId: '25KMT4Z9',
      movementIds: [],
      orgId: forwardedOrganisationId
    })
  })

  // Scenario: A Receipt is created when more than one treatment is declared.
  it('acknowledges receipt when a waste item has more than one treatment', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        reasonForNoDeliveryId,
        carrier,
        receiver,
        wasteItems: [
          {
            ...wasteItem,
            treatments: [
              treatment,
              { ...treatment, disposalOrRecoveryCode: 'D10' }
            ]
          }
        ]
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { deliveryId: '25KMT4Z9' },
      validation: { warnings: [] }
    })
  })

  it('acknowledges receipt when a brokerOrDealer and supportingReferences are provided', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        reasonForNoDeliveryId,
        carrier,
        receiver,
        wasteItems,
        brokerOrDealer: { isPresent: true, items: [brokerOrDealerEntry] },
        supportingReferences: [supportingReference]
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { deliveryId: '25KMT4Z9' },
      validation: { warnings: [] }
    })
  })

  it('returns a 400 when a declared brokerOrDealer has no details', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        reasonForNoDeliveryId,
        carrier,
        receiver,
        wasteItems,
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

  it('returns a 400 when a supportingReference has an unrecognised label', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        reasonForNoDeliveryId,
        carrier,
        receiver,
        wasteItems,
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
    const { headers } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        reasonForNoDeliveryId,
        carrier,
        receiver,
        wasteItems
      },
      headers: tracedAuthHeaders
    })

    expect(headers['x-request-id']).toEqual(traceId)
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
      detail: '5 validation errors occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: "'reasonForNoDeliveryId' is required",
          pointer: '/reasonForNoDeliveryId'
        },
        {
          errorType: 'NotProvided',
          message: "'receiptDateTime' is required",
          pointer: '/receiptDateTime'
        },
        {
          errorType: 'NotProvided',
          message: "'carrier' is required",
          pointer: '/carrier'
        },
        {
          errorType: 'NotProvided',
          message: "'receiver' is required",
          pointer: '/receiver'
        },
        {
          errorType: 'NotProvided',
          message: "'wasteItems' is required",
          pointer: '/wasteItems'
        }
      ],
      instance: '/beta-3/receipts',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 400 when carrier is missing', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { receiptDateTime, reasonForNoDeliveryId, receiver, wasteItems },
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
      instance: '/beta-3/receipts',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 400 when wasteItems is missing', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { receiptDateTime, reasonForNoDeliveryId, carrier, receiver },
      headers: tracedAuthHeaders
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
      instance: '/beta-3/receipts',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  // Scenario: A Receipt isn't created when no treatment is declared.
  it('returns a 400 when a waste item has no treatments', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        reasonForNoDeliveryId,
        carrier,
        receiver,
        wasteItems: [wasteItem]
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
          pointer: '/wasteItems/0/treatments'
        }
      ],
      instance: '/beta-3/receipts',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 400 when receiver is missing', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { receiptDateTime, reasonForNoDeliveryId, carrier, wasteItems },
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
      instance: '/beta-3/receipts',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  // apiCode is sent in the x-api-code header and resolved by the
  // external API, so the backend rejects it in the body.
  it('returns a 400 when apiCode is sent in the body', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        apiCode: apiCode1,
        carrier,
        receiver,
        wasteItems,
        reasonForNoDeliveryId
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
      instance: '/beta-3/receipts',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 400 when no organisation was forwarded (unknown or disabled API code)', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        reasonForNoDeliveryId,
        carrier,
        receiver,
        wasteItems
      },
      headers: { ...authHeaders, ...tracedHeaders }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: 'the API Code supplied is invalid',
      instance: '/beta-3/receipts',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 500 when persisting the delivery fails', async () => {
    const error = 'Database connection failed'
    vi.spyOn(delivery, 'createDeliveryRecord').mockRejectedValue(
      new Error(error)
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        reasonForNoDeliveryId,
        carrier,
        receiver,
        wasteItems
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      instance: '/beta-3/receipts',
      title: 'Internal Server Error',
      type: `${expectedTypeBase}internal-server-error`,
      requestId: traceId
    })
  })

  it('returns 401 when unauthenticated', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        reasonForNoDeliveryId,
        carrier,
        receiver,
        wasteItems
      },
      headers: tracedHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED)
    expect(result).toEqual({
      detail: 'Missing authentication',
      instance: '/beta-3/receipts',
      title: 'Unauthorized',
      type: `${expectedTypeBase}unauthorized`,
      requestId: traceId
    })
  })

  it('returns a 500 when the response body does not match the response schema', async () => {
    vi.mocked(createDeliveryId).mockResolvedValueOnce(42)
    // Stubbed so the bad id isn't rejected by the deliveries collection first.
    vi.spyOn(delivery, 'createDeliveryRecord').mockResolvedValueOnce({})

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        receiptDateTime,
        reasonForNoDeliveryId: 'No delivery was recorded',
        carrier,
        receiver,
        wasteItems
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

  // Shared by the business scenario features below.
  // Background: they are authenticated and have a valid API Code.
  // The Receipt ID is the Delivery ID minted for the receipt.
  const receiptId = '25KMT4Z9'

  const submit = (payload) =>
    server.inject({
      method: 'POST',
      url,
      payload,
      headers: tracedAuthHeaders
    })

  // A receipt needs at least one treatment on every waste item.
  const receiptItem = (item) => ({ ...item, treatments: [treatment] })
  const nonHazardousItem = receiptItem(wasteItem)
  const hazardousItem = receiptItem(hazardousWasteItem)

  const withWasteItems = (items, extra = {}) => ({
    receiptDateTime,
    reasonForNoDeliveryId,
    carrier,
    receiver,
    wasteItems: items,
    ...extra
  })

  const storedReceipts = () =>
    server.db.collection(collectionName('deliveries')).countDocuments()

  // An earlier test leaves createDeliveryRecord mocked to fail, and
  // clearAllMocks doesn't undo that, so the scenarios restore the real one.
  const restoreCreateDeliveryRecord = () => {
    if (vi.isMockFunction(delivery.createDeliveryRecord)) {
      delivery.createDeliveryRecord.mockRestore()
    }
  }

  const expectCreated = async (payload) => {
    const { statusCode, result } = await submit(payload)

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result.data).toEqual({ deliveryId: receiptId })
    expect(await storedReceipts()).toBe(1)
  }

  const expectRejected = async (payload, errors) => {
    const { statusCode, result } = await submit(payload)

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toEqual(errors)
    expect(await storedReceipts()).toBe(0)
  }

  const consignmentNoteRequired = {
    errorType: 'NotProvided',
    message:
      "Required when a waste item declares hazardous properties, with a 'code' or a 'reasonForNoCode'",
    pointer: '/consignmentNote'
  }

  describe('Feature: Describing the waste when recording the receipt of undocumented waste', () => {
    beforeEach(restoreCreateDeliveryRecord)

    // Every classification declares its POPs and hazardous properties; these
    // scenarios aren't about them, so it's always none unless the test says
    // otherwise.
    const withClassification = (classification) =>
      withWasteItems([
        {
          ...nonHazardousItem,
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
    const reasonRequired = {
      errorType: 'NotProvided',
      message:
        "Required when a waste item declares hazardous properties and 'code' is not provided",
      pointer: '/consignmentNote/reasonForNoCode'
    }

    describe('Scenario: A Receipt is created when non-hazardous waste is described without a consignment code', () => {
      it('creates the receipt for a waste description and a non-hazardous EWC code', async () => {
        await expectCreated(
          withClassification({
            wasteDescription: 'Paper and cardboard',
            ewcCodes: ['200101']
          })
        )
      })
    })

    describe('Scenario: A Receipt is created when a consignment code is given for non-hazardous waste', () => {
      it('creates the receipt for a non-hazardous EWC code and a valid consignment code', async () => {
        await expectCreated(
          withWasteItems([nonHazardousItem], { consignmentNote })
        )
      })
    })

    describe('Scenario: A Receipt is created when a mirror EWC code is provided', () => {
      it.each([
        ['1 EWC code', ['170504']],
        ['2 EWC codes', ['170504', '191212']],
        ['5 EWC codes', ['170504', '191212', '170904', '170604', '200101']]
      ])('creates the receipt with %s', async (_, ewcCodes) => {
        await expectCreated(
          withClassification({ wasteDescription: 'Soil and stones', ewcCodes })
        )
      })
    })

    describe("Scenario Outline: A Receipt isn't created when the waste description is missing", () => {
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

    describe("Scenario Outline: A Receipt isn't created when the EWC code is missing or invalid", () => {
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
    })

    describe("Scenario: A Receipt isn't created when more than 5 EWC codes are declared", () => {
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

    describe('Scenario Outline: A Receipt is created when hazardous waste has a consignment code', () => {
      it.each([
        ['EA / NRW', 'SMITHS/A1234'],
        ['SEPA', 'SA1234567'],
        ['NIEA', 'DA1234567']
      ])('creates the receipt with a %s code of %s', async (_, code) => {
        await expectCreated(
          withWasteItems([hazardousItem], { consignmentNote: { code } })
        )
      })
    })

    describe('Scenario: A Receipt is created when hazardous waste has a reason for no consignment code', () => {
      it('creates the receipt with a hazardous EWC code and a reason', async () => {
        await expectCreated(
          withWasteItems([hazardousItem], {
            consignmentNote: { reasonForNoCode }
          })
        )
      })
    })

    describe("Scenario: A Receipt isn't created when hazardous waste has neither a consignment code nor a reason", () => {
      it('rejects a code and a reason that are not provided, saying a reason is required', async () => {
        await expectRejected(
          withWasteItems([hazardousItem], { consignmentNote: {} }),
          [reasonRequired]
        )
      })

      it('rejects a receipt with no consignment note at all, saying a code or a reason is required', async () => {
        await expectRejected(withWasteItems([hazardousItem]), [
          consignmentNoteRequired
        ])
      })
    })

    describe("Scenario: A Receipt isn't created when any one of several wastes is hazardous and has neither a consignment code nor a reason", () => {
      it('rejects one hazardous and one non-hazardous waste with no consignment code or reason', async () => {
        await expectRejected(
          withWasteItems([nonHazardousItem, hazardousItem], {
            consignmentNote: {}
          }),
          [reasonRequired]
        )
      })
    })

    describe("Scenario Outline: A Receipt isn't created when the reason for no consignment code is null or empty", () => {
      it.each([
        ['""', '', 'OutOfRange', 'must NOT have fewer than 1 characters'],
        ['null', null, 'InvalidType', 'must be string']
      ])(
        'rejects a reason of %s rather than reading it as not provided',
        async (_, reasonForNoCode, errorType, message) => {
          await expectRejected(
            withWasteItems([hazardousItem], {
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

    describe("Scenario Outline: A Receipt isn't created when the consignment code is invalid", () => {
      it.each(['12345', 'ABC/123', 'SD1234567'])(
        'rejects a consignment code of %p as not in a recognised format',
        async (code) => {
          await expectRejected(
            withWasteItems([hazardousItem], { consignmentNote: { code } }),
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

    describe("Scenario: A Receipt isn't created when both a consignment code and a reason are given", () => {
      it('rejects the reason as not permitted', async () => {
        await expectRejected(
          withWasteItems([hazardousItem], {
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

    describe("Scenario: A Receipt isn't created when any one of several wastes is described with missing or invalid details", () => {
      it('reports each invalid detail against the waste it belongs to', async () => {
        await expectRejected(
          withWasteItems([
            nonHazardousItem,
            {
              ...nonHazardousItem,
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

  describe('Feature: Declaring persistent organic pollutants when creating a receipt of undocumented waste', () => {
    beforeEach(restoreCreateDeliveryRecord)

    const withPops = (pops) =>
      withWasteItems([
        {
          ...nonHazardousItem,
          classification: { ...nonHazardousItem.classification, pops }
        }
      ])
    const withComponents = (components) =>
      withPops({ ...popsPresent, components })

    const popsPointer = '/wasteItems/0/classification/pops'
    const componentPointer = (index, field) =>
      `${popsPointer}/components/${index}/${field}`

    describe('Scenario: A Receipt is created when the waste is declared as not containing POPs', () => {
      it('creates the receipt', async () => {
        await expectCreated(withPops({ isPresent: false }))
      })
    })

    describe('Scenario Outline: A Receipt is created when a POP is declared with an amount', () => {
      // HBCDD in the scenario is HBCD in the reference data.
      it.each([
        ['PFOA', 0.5],
        ['PFOS', 12],
        ['HBCD', 0.001]
      ])(
        'creates the receipt with a POP code of %s and an amount of %s mg/kg',
        async (code, amount) => {
          await expectCreated(
            withComponents([{ code, unit: 'MG_PER_KG', amount }])
          )
        }
      )
    })

    describe('Scenario Outline: A Receipt is created when a POP is declared against its threshold', () => {
      it.each([
        ['less than', 'LESS_THAN'],
        ['equal to', 'EQUAL_TO'],
        ['greater than', 'GREATER_THAN']
      ])(
        'creates the receipt with a PFOA concentration %s its threshold',
        async (_, threshold) => {
          await expectCreated(withComponents([{ code: 'PFOA', threshold }]))
        }
      )
    })

    describe('Scenario Outline: A Receipt is created when the source of the POP details is declared', () => {
      it.each([
        ['Government guidance', 'GUIDANCE'],
        ['Provided with the waste', 'PROVIDED_WITH_WASTE'],
        ['Own testing or analysis', 'OWN_TESTING']
      ])(
        'creates the receipt with a source of %s',
        async (_, componentsSource) => {
          await expectCreated(withPops({ ...popsPresent, componentsSource }))
        }
      )
    })

    describe('Scenario: A Receipt is created when more than one POP is declared', () => {
      it('creates the receipt with a code and an amount or threshold for each POP', async () => {
        await expectCreated(
          withComponents([
            { code: 'PFOA', unit: 'MG_PER_KG', amount: 0.5 },
            { code: 'PFOS', threshold: 'GREATER_THAN' }
          ])
        )
      })
    })

    describe("Scenario Outline: A Receipt isn't created when whether the waste contains POPs is missing or invalid", () => {
      // Examples: Not provided or empty
      it('rejects whether the waste contains POPs not being provided, as required', async () => {
        await expectRejected(withPops({}), [
          {
            errorType: 'NotProvided',
            message: "'isPresent' is required",
            pointer: `${popsPointer}/isPresent`
          }
        ])
      })

      // Examples: Not recognised. "" isn't true or false either.
      it.each(['', 'Maybe', 'Unknown'])(
        'rejects whether the waste contains POPs of %p as not true or false',
        async (isPresent) => {
          await expectRejected(withPops({ isPresent }), [
            {
              errorType: 'InvalidType',
              message: 'must be boolean',
              pointer: `${popsPointer}/isPresent`
            }
          ])
        }
      )

      it('rejects POPs not being declared at all', async () => {
        const { pops: _, ...withoutPops } = nonHazardousItem.classification
        await expectRejected(
          withWasteItems([
            { ...nonHazardousItem, classification: withoutPops }
          ]),
          [
            {
              errorType: 'NotProvided',
              message: "'pops' is required",
              pointer: popsPointer
            }
          ]
        )
      })
    })

    describe("Scenario: A Receipt isn't created when POP details are given for waste declared as not containing POPs", () => {
      it('rejects the POP details as not permitted', async () => {
        await expectRejected(withPops({ ...popsPresent, isPresent: false }), [
          {
            errorType: 'NotAllowed',
            message: "Not allowed unless 'isPresent' is true",
            pointer: `${popsPointer}/componentsSource`
          },
          {
            errorType: 'NotAllowed',
            message: "Not allowed unless 'isPresent' is true",
            pointer: `${popsPointer}/components`
          }
        ])
      })
    })

    describe("Scenario: A Receipt isn't created when the waste contains POPs but none are declared", () => {
      it('rejects no POPs being declared, saying at least one is required', async () => {
        const { components, ...withoutComponents } = popsPresent
        await expectRejected(withPops(withoutComponents), [
          {
            errorType: 'NotProvided',
            message: "Required when 'isPresent' is true",
            pointer: `${popsPointer}/components`
          }
        ])
      })

      it('rejects an empty list of POPs, saying at least one is required', async () => {
        await expectRejected(withComponents([]), [
          {
            errorType: 'OutOfRange',
            message: 'must NOT have fewer than 1 items',
            pointer: `${popsPointer}/components`
          }
        ])
      })
    })

    describe("Scenario Outline: A Receipt isn't created when the POP code is missing or invalid", () => {
      // Examples: Not provided or empty
      it('rejects a POP code that is not provided, as required', async () => {
        await expectRejected(
          withComponents([{ unit: 'MG_PER_KG', amount: 0.5 }]),
          [
            {
              errorType: 'NotProvided',
              message: "'code' is required",
              pointer: componentPointer(0, 'code')
            }
          ]
        )
      })

      it('rejects a POP code of ""', async () => {
        await expectRejected(withComponents([{ ...popComponent, code: '' }]), [
          {
            errorType: 'OutOfRange',
            message: 'must NOT have fewer than 1 characters',
            pointer: componentPointer(0, 'code')
          }
        ])
      })

      // Examples: Not recognised
      it.each(['Mercury', 'ABC123'])(
        'rejects a POP code of %p as not recognised',
        async (code) => {
          await expectRejected(withComponents([{ ...popComponent, code }]), [
            {
              errorType: 'InvalidValue',
              message: 'must be a recognised POP code',
              pointer: componentPointer(0, 'code')
            }
          ])
        }
      )
    })

    describe("Scenario: A Receipt isn't created when a POP has neither an amount nor a threshold", () => {
      it('rejects the POP, saying an amount or threshold is required', async () => {
        await expectRejected(withComponents([{ code: 'PFOA' }]), [
          {
            errorType: 'NotProvided',
            message: "Required when 'amount' is not provided",
            pointer: componentPointer(0, 'threshold')
          }
        ])
      })
    })

    describe("Scenario: A Receipt isn't created when a POP has both an amount and a threshold", () => {
      it('rejects the threshold, saying only one of the two is permitted', async () => {
        await expectRejected(
          withComponents([{ ...popComponent, threshold: 'LESS_THAN' }]),
          [
            {
              errorType: 'NotAllowed',
              message: "Not allowed when 'amount' is provided",
              pointer: componentPointer(0, 'threshold')
            }
          ]
        )
      })
    })

    describe("Scenario: A Receipt isn't created when a POP has an amount but no unit", () => {
      it('rejects the POP, saying a unit is required', async () => {
        await expectRejected(withComponents([{ code: 'PFOA', amount: 0.5 }]), [
          {
            errorType: 'NotProvided',
            message: "Required when 'amount' is provided",
            pointer: componentPointer(0, 'unit')
          }
        ])
      })
    })

    describe("Scenario Outline: A Receipt isn't created when the POP unit is invalid", () => {
      // Examples: Not recognised, including in the wrong case.
      it.each(['', 'mg_per_kg', 'MG/KG', 'PPM'])(
        'rejects a POP unit of %p as not recognised',
        async (unit) => {
          await expectRejected(withComponents([{ ...popComponent, unit }]), [
            {
              errorType: 'InvalidValue',
              message: "must be one of: 'MG_PER_KG'",
              pointer: componentPointer(0, 'unit')
            }
          ])
        }
      )
    })

    describe("Scenario Outline: A Receipt isn't created when the POP amount is invalid", () => {
      // Examples: Not a number. An amount that isn't known is left out,
      // and a threshold given instead.
      it.each(['', null, '0.5'])(
        'rejects a POP amount of %p as not a number',
        async (amount) => {
          await expectRejected(withComponents([{ ...popComponent, amount }]), [
            {
              errorType: 'InvalidType',
              message: 'must be number',
              pointer: componentPointer(0, 'amount')
            }
          ])
        }
      )

      // Examples: Not greater than 0
      it.each([0, -1])(
        'rejects a POP amount of %p as not greater than 0',
        async (amount) => {
          await expectRejected(withComponents([{ ...popComponent, amount }]), [
            {
              errorType: 'OutOfRange',
              message: 'must be > 0',
              pointer: componentPointer(0, 'amount')
            }
          ])
        }
      )
    })

    describe("Scenario Outline: A Receipt isn't created when the POP threshold is invalid", () => {
      it.each(['Greater than', 'Above'])(
        'rejects a POP threshold of %p as not recognised',
        async (threshold) => {
          await expectRejected(withComponents([{ code: 'PFOA', threshold }]), [
            {
              errorType: 'InvalidValue',
              message:
                "must be one of: 'LESS_THAN', 'EQUAL_TO', 'GREATER_THAN'",
              pointer: componentPointer(0, 'threshold')
            }
          ])
        }
      )
    })

    describe("Scenario Outline: A Receipt isn't created when the source of the POP details is missing or invalid", () => {
      // Examples: Not provided or empty
      it('rejects a source that is not provided, as required', async () => {
        const { componentsSource, ...withoutSource } = popsPresent
        await expectRejected(withPops(withoutSource), [
          {
            errorType: 'NotProvided',
            message: "Required when 'isPresent' is true",
            pointer: `${popsPointer}/componentsSource`
          }
        ])
      })

      // Examples: Not recognised. "" isn't one of the sources either.
      it.each(['', 'Supplier', 'Unknown'])(
        'rejects a source of %p as not recognised',
        async (componentsSource) => {
          await expectRejected(withPops({ ...popsPresent, componentsSource }), [
            {
              errorType: 'InvalidValue',
              message:
                "must be one of: 'GUIDANCE', 'PROVIDED_WITH_WASTE', 'OWN_TESTING'",
              pointer: `${popsPointer}/componentsSource`
            }
          ])
        }
      )
    })

    describe("Scenario: A Receipt isn't created when any one of several POPs is declared with missing or invalid details", () => {
      it('reports each invalid detail against the POP it belongs to', async () => {
        await expectRejected(
          withComponents([
            popComponent,
            { code: 'ABC123', unit: 'MG_PER_KG', amount: 0 },
            { threshold: 'Above' }
          ]),
          [
            {
              errorType: 'OutOfRange',
              message: 'must be > 0',
              pointer: componentPointer(1, 'amount')
            },
            {
              errorType: 'NotProvided',
              message: "'code' is required",
              pointer: componentPointer(2, 'code')
            },
            {
              errorType: 'InvalidValue',
              message:
                "must be one of: 'LESS_THAN', 'EQUAL_TO', 'GREATER_THAN'",
              pointer: componentPointer(2, 'threshold')
            },
            {
              errorType: 'InvalidValue',
              message: 'must be a recognised POP code',
              pointer: componentPointer(1, 'code')
            }
          ]
        )
      })
    })
  })

  describe('Feature: Declaring the hazardous properties of the waste', () => {
    beforeEach(restoreCreateDeliveryRecord)

    const withHazardous = (hazardous, extra) =>
      withWasteItems(
        [
          {
            ...nonHazardousItem,
            classification: { ...nonHazardousItem.classification, hazardous }
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

    describe('Scenario: A Receipt is created when the waste is declared as having no hazardous properties', () => {
      it('creates the receipt', async () => {
        await expectCreated(withHazardous({ isPresent: false }))
      })
    })

    describe('Scenario Outline: A Receipt is created when hazardous properties are declared', () => {
      it.each([[['HP_4']], [['HP_4', 'HP_8']]])(
        'creates the receipt with codes %p',
        async (codes) => {
          await expectCreated(
            withHazardousProperties({ ...hazardousPresent, codes })
          )
        }
      )
    })

    describe("Scenario Outline: A Receipt isn't created when whether the waste has hazardous properties is missing or invalid", () => {
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
        const { hazardous: _, ...withoutHazardous } =
          nonHazardousItem.classification
        await expectRejected(
          withWasteItems([
            { ...nonHazardousItem, classification: withoutHazardous }
          ]),
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

    describe("Scenario Outline: A Receipt isn't created when the waste has hazardous properties but the codes are missing or invalid", () => {
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

    describe("Scenario: A Receipt isn't created when codes are given for waste declared as having no hazardous properties", () => {
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

    describe("Scenario: A Receipt isn't created when several wastes declare invalid hazardous properties", () => {
      it('reports each invalid declaration against the waste it belongs to', async () => {
        const withDeclaration = (hazardous) => ({
          ...nonHazardousItem,
          classification: { ...nonHazardousItem.classification, hazardous }
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

    describe('Scenario Outline: A Receipt is created when hazardous components are declared', () => {
      it.each([
        [[hazardousComponent]],
        [[{ name: 'Lead compounds', threshold: 'GREATER_THAN' }]],
        [
          [
            hazardousComponent,
            { name: 'Lead compounds', threshold: 'EQUAL_TO' }
          ]
        ]
      ])('creates the receipt with components %j', async (components) => {
        await expectCreated(
          withHazardousProperties({ ...hazardousPresent, components })
        )
      })
    })

    describe('Scenario: A Receipt is created when no hazardous components need reporting', () => {
      it('creates the receipt with a source and no components', async () => {
        const { components: _, ...withoutComponents } = hazardousPresent
        await expectCreated(
          withHazardousProperties({
            ...withoutComponents,
            isComponentsNotApplicable: true
          })
        )
      })
    })

    describe("Scenario: A Receipt isn't created when hazardous details are given for waste declared as having no hazardous properties", () => {
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

    describe("Scenario: A Receipt isn't created when the waste is hazardous but neither components nor not applicable are declared", () => {
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

    describe("Scenario: A Receipt isn't created when components are given although declared not applicable", () => {
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

    describe("Scenario: A Receipt isn't created when any one of several hazardous components is declared with missing or invalid details", () => {
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

    describe('Scenario: A Receipt is created without a consignment note when a hazardous EWC code is declared as having no hazardous properties', () => {
      it('creates the receipt for fluorescent tubes declared as not hazardous', async () => {
        await expectCreated(
          withWasteItems([
            {
              ...nonHazardousItem,
              classification: {
                ...hazardousWasteItem.classification,
                hazardous: { isPresent: false }
              }
            }
          ])
        )
      })
    })

    describe("Scenario: A Receipt isn't created without a consignment note when a non-hazardous EWC code is declared as having hazardous properties", () => {
      it('rejects the receipt, saying a consignment note is required', async () => {
        await expectRejected(
          withHazardous({ ...hazardousPresent, codes: ['HP_4'] }),
          [consignmentNoteRequired]
        )
      })
    })
  })

  describe('Feature: Recording when the waste was actually received, with no delivery record', () => {
    beforeEach(restoreCreateDeliveryRecord)

    const withReceiptDateTime = (value = receiptDateTime) =>
      withWasteItems([nonHazardousItem], { receiptDateTime: value })

    describe('Scenario: A receipt is recorded when a valid date and time of receipt is declared with no delivery record', () => {
      it.each([
        ['2026-10-14T09:30:00Z'],
        ['2026-10-14T10:30:00+01:00'],
        // A moment ago: anything not later than the time of submission.
        [new Date(Date.now() - 1000).toISOString()]
      ])('records the receipt received at %p', async (value) => {
        await expectCreated(withReceiptDateTime(value))
      })
    })

    describe("Scenario Outline: A receipt isn't recorded when the date and time of receipt is missing or invalid", () => {
      const pointer = '/receiptDateTime'

      it('rejects a date and time of receipt that is not provided, as required', async () => {
        const { receiptDateTime: _, ...payload } = withReceiptDateTime()
        await expectRejected(payload, [
          {
            errorType: 'NotProvided',
            message: "'receiptDateTime' is required",
            pointer
          }
        ])
      })

      it('rejects a date and time of receipt of "", as required', async () => {
        await expectRejected(withReceiptDateTime(''), [
          {
            errorType: 'NotProvided',
            message: "'receiptDateTime' is required",
            pointer
          }
        ])
      })

      it.each(['14/10/2026', '2026-13-01T10:00:00Z', 'Yesterday'])(
        'rejects a date and time of receipt of %p as not a valid date and time',
        async (value) => {
          await expectRejected(withReceiptDateTime(value), [
            {
              errorType: 'InvalidFormat',
              message: "must match format 'date-time'",
              pointer
            }
          ])
        }
      )

      it('rejects a date and time of receipt in the future', async () => {
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
})
