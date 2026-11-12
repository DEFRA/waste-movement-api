import { randomUUID } from 'node:crypto'
import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { test as integrationTest } from '#test/integration/helpers/fixtures.js'
import { expectStandardHeaders } from '#test/integration/helpers/expect-standard-headers.js'
import { describeBetaEndpointTests } from '#test/integration/helpers/beta-endpoint-tests.js'
import { apiCode1 } from '#test/data/api-codes.js'
import { forwardedOrganisationId } from '#test/data/organisation-headers.js'
import { ObjectId } from 'mongodb'
import { expectProblemResponse } from '#test/integration/helpers/expect-problem-response.js'
import { expectResponseBodyHasCorrectShape } from '#test/integration/helpers/expect-response-body-has-shape.js'
import {
  receiptDateTime,
  collectionDateTime,
  brokerOrDealerEntry,
  carrier,
  collectionSite,
  consignmentNote,
  deliveryDateTime,
  deliverySite,
  hazardousWasteItem,
  receiver,
  supportingReference,
  physicalDetails,
  treatment,
  wasteItem
} from '../schemas/test-helpers.js'
import { collectionName, version } from '../index.js'

const { apiVersion } = version

const intendedCarriers = [carrier]
const deliveryDetails = { carrier, deliveryDateTime, deliverySite }
const intendedReceivers = [receiver]
const wasteItems = [wasteItem]
// Receipts need at least one treatment (on every waste item, for an
// undocumented receipt); creating a movement forbids them.
const treatments = [treatment]
const receiptWasteItems = [{ ...wasteItem, treatments }]
const minimalMovement = {
  producer: { wasteSource: 'HOUSEHOLD' },
  collectionDateTime,
  collectionSite,
  intendedCarriers,
  intendedReceivers,
  wasteItems
}
const isDutyOfCareConfirmed = true

const test = integrationTest.extend({
  // Creates a movement, e.g. createMovement({ wasteItems }), returning its ID
  createMovement: async ({ api }, use) => {
    await use(async (overrides = {}) => {
      const { body } = await api(`/${apiVersion}/movements`, {
        method: 'POST',
        body: { ...minimalMovement, ...overrides }
      })
      return body.data.movementId
    })
  },

  // A minimal movement's ID, for tests that need one to exist
  movementId: async ({ createMovement }, use) => {
    await use(await createMovement())
  }
})

describe(apiVersion, () => {
  // Shared error formatting and RFC9457 compliance tests
  describeBetaEndpointTests(apiVersion, {
    apiCode1,
    minimalProducer: minimalMovement
  })

  describe(`POST /${apiVersion}/movements`, () => {
    test('creates a movement with minimal payload', async ({
      api,
      service
    }) => {
      const producer = { wasteSource: 'HOUSEHOLD' }
      const { status, body, headers } = await api(`/${apiVersion}/movements`, {
        method: 'POST',
        body: {
          producer,
          collectionDateTime,
          collectionSite,
          intendedCarriers,
          intendedReceivers,
          wasteItems
        }
      })

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
      expect(body).toEqual({
        data: { movementId: expect.any(String) },
        validation: { warnings: [] }
      })
      expectStandardHeaders(headers)

      const { movementId } = body.data
      const movement = await service.db
        .collection(collectionName('movements'))
        .findOne({ movementId })

      expect(movement).toMatchObject({
        _id: expect.any(ObjectId),
        movementId,
        orgId: forwardedOrganisationId,
        wasteItems,
        createdAt: expect.any(String)
      })
    })

    test('creates a movement with producer payload', async ({
      api,
      service
    }) => {
      const producer = { wasteSource: 'HOUSEHOLD' }
      const { status, body, headers } = await api(`/${apiVersion}/movements`, {
        method: 'POST',
        body: {
          producer,
          collectionDateTime,
          collectionSite,
          intendedCarriers,
          intendedReceivers,
          wasteItems
        }
      })

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
      expect(body).toMatchObject({
        data: { movementId: expect.any(String) },
        validation: { warnings: [] }
      })
      expectStandardHeaders(headers)

      const { movementId } = body.data
      const movement = await service.db
        .collection(collectionName('movements'))
        .findOne({ movementId })

      expect(movement).toMatchObject({
        _id: expect.any(ObjectId),
        movementId,
        orgId: forwardedOrganisationId,
        createdAt: expect.any(String)
      })
    })

    test('creates a movement with commercial producer', async ({
      api,
      service
    }) => {
      const producer = {
        wasteSource: 'COMMERCIAL',
        organisationName: 'ACME Waste Ltd',
        sicCode: '38110',
        authorisationNumber: 'EAS/P/123456',
        address: {
          fullAddress: '10 Industrial Way, Test City',
          postcode: 'TE1 2PQ'
        },
        contactDetails: {
          emailAddress: 'contact@acme.com'
        }
      }
      const { status, body, headers } = await api(`/${apiVersion}/movements`, {
        method: 'POST',
        body: {
          producer,
          collectionDateTime,
          collectionSite,
          intendedCarriers,
          intendedReceivers,
          wasteItems
        }
      })

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
      expect(body).toMatchObject({
        data: { movementId: expect.any(String) },
        validation: { warnings: [] }
      })
      expectStandardHeaders(headers)

      const { movementId } = body.data
      const movement = await service.db
        .collection(collectionName('movements'))
        .findOne({ movementId })

      expect(movement).toMatchObject({
        _id: expect.any(ObjectId),
        movementId,
        orgId: forwardedOrganisationId,
        createdAt: expect.any(String)
      })
    })
  })

  test(`POST /${apiVersion}/movements/{movementId}/collection creates a collection`, async ({
    api,
    service
  }) => {
    const createRes = await api(`/${apiVersion}/movements`, {
      method: 'POST',
      body: { ...minimalMovement }
    })
    const { movementId } = createRes.body.data

    const { status, body, headers } = await api(
      `/${apiVersion}/movements/${movementId}/collection`,
      {
        method: 'POST',
        body: {
          carrier,
          collectionDateTime,
          collectionSite,
          isDutyOfCareConfirmed
        }
      }
    )

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body).toEqual({
      data: null,
      validation: { warnings: [] }
    })
    expectStandardHeaders(headers)

    const movement = await service.db
      .collection(collectionName('movements'))
      .findOne({ movementId })

    expect(movement).toMatchObject({
      movementId,
      orgId: forwardedOrganisationId,
      createdAt: expect.any(String)
    })
  })

  test(`POST /${apiVersion}/movements/{movementId}/collection creates a collection with a brokerOrDealer and supportingReferences`, async ({
    api,
    createMovement,
    movementId
  }) => {
    const { status, body, headers } = await api(
      `/${apiVersion}/movements/${movementId}/collection`,
      {
        method: 'POST',
        body: {
          carrier,
          collectionDateTime,
          collectionSite,
          isDutyOfCareConfirmed,
          brokerOrDealer: { isPresent: true, items: [brokerOrDealerEntry] },
          supportingReferences: [supportingReference]
        }
      }
    )

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body).toEqual({
      data: null,
      validation: { warnings: [] }
    })
    expectStandardHeaders(headers)
  })

  test(`POST /${apiVersion}/deliveries records a delivery`, async ({
    api,
    service
  }) => {
    const createRes = await api(`/${apiVersion}/movements`, {
      method: 'POST',
      body: { ...minimalMovement }
    })
    const { movementId } = createRes.body.data

    const { status, body, headers } = await api(`/${apiVersion}/deliveries`, {
      method: 'POST',
      body: { movementIds: [movementId], ...deliveryDetails }
    })

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body.data.deliveries).toHaveLength(1)
    expect(body.data.deliveries[0].movementIds).toEqual([movementId])
    expectStandardHeaders(headers)

    const { deliveryId } = body.data.deliveries[0]
    const delivery = await service.db
      .collection(collectionName('deliveries'))
      .findOne({ deliveryId })

    expect(delivery).toMatchObject({
      _id: expect.any(ObjectId),
      deliveryId,
      orgId: forwardedOrganisationId,
      movementIds: [movementId],
      createdAt: expect.any(String)
    })
  })

  // hazardousWasteItem declares hazardous properties; hazardous waste needs a
  // consignment note.
  const hazardousMovement = {
    wasteItems: [hazardousWasteItem],
    consignmentNote
  }

  test(`POST /${apiVersion}/movements stores a hazardous waste item`, async ({
    service,
    createMovement
  }) => {
    const movementId = await createMovement(hazardousMovement)

    const movement = await service.db
      .collection(collectionName('movements'))
      .findOne({ movementId })

    expect(movement).toMatchObject({
      movementId,
      wasteItems: [hazardousWasteItem]
    })
    expect(movement).not.toHaveProperty('wasteType')
  })

  test(`POST /${apiVersion}/deliveries splits hazardous movements into their own deliveries`, async ({
    api,
    service,
    createMovement
  }) => {
    const nonHazardousId1 = await createMovement()
    const hazardousId = await createMovement(hazardousMovement)
    const nonHazardousId2 = await createMovement()

    const { status, body } = await api(`/${apiVersion}/deliveries`, {
      method: 'POST',
      body: {
        movementIds: [nonHazardousId1, hazardousId, nonHazardousId2],
        ...deliveryDetails
      }
    })

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body.data.deliveries).toEqual([
      {
        deliveryId: expect.any(String),
        movementIds: [nonHazardousId1, nonHazardousId2],
        wasteType: 'NON_HAZARDOUS'
      },
      {
        deliveryId: hazardousId,
        movementIds: [hazardousId],
        wasteType: 'HAZARDOUS'
      }
    ])

    const deliveries = await service.db
      .collection(collectionName('deliveries'))
      .find({
        deliveryId: {
          $in: body.data.deliveries.map(({ deliveryId }) => deliveryId)
        }
      })
      .toArray()

    expect(deliveries).toHaveLength(2)
    expect(deliveries).toEqual(
      expect.arrayContaining(
        body.data.deliveries.map((delivery) =>
          expect.objectContaining({
            ...delivery,
            orgId: forwardedOrganisationId
          })
        )
      )
    )
  })

  test(`POST /${apiVersion}/deliveries/{deliveryId}/receipt records a receipt against a delivery`, async ({
    api,
    service
  }) => {
    const createMovementRes = await api(`/${apiVersion}/movements`, {
      method: 'POST',
      body: { ...minimalMovement }
    })
    const { movementId } = createMovementRes.body.data

    const createDeliveryRes = await api(`/${apiVersion}/deliveries`, {
      method: 'POST',
      body: { movementIds: [movementId], ...deliveryDetails }
    })
    const { deliveryId } = createDeliveryRes.body.data.deliveries[0]

    const { status, body, headers } = await api(
      `/${apiVersion}/deliveries/${deliveryId}/receipt`,
      {
        method: 'POST',
        body: {
          receiptDateTime,
          carrier,
          receiver,
          physicalDetails,
          treatments
        }
      }
    )

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body).toEqual({
      data: { deliveryId },
      validation: { warnings: [] }
    })
    expectStandardHeaders(headers)

    const delivery = await service.db
      .collection(collectionName('deliveries'))
      .findOne({ deliveryId })

    expect(delivery).toMatchObject({
      deliveryId,
      orgId: forwardedOrganisationId,
      movementIds: [movementId],
      createdAt: expect.any(String)
    })
  })

  test(`POST /${apiVersion}/receipts records an undocumented receipt`, async ({
    api,
    service
  }) => {
    const reasonForNoDeliveryId = 'No prior movement trail'
    const { status, body, headers } = await api(`/${apiVersion}/receipts`, {
      method: 'POST',
      body: {
        receiptDateTime,
        reasonForNoDeliveryId,
        carrier,
        receiver,
        wasteItems: receiptWasteItems
      }
    })

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body).toEqual({
      data: { deliveryId: expect.any(String) },
      validation: { warnings: [] }
    })
    expectStandardHeaders(headers)

    const { deliveryId } = body.data
    const delivery = await service.db
      .collection(collectionName('deliveries'))
      .findOne({ deliveryId })

    expect(delivery).toMatchObject({
      _id: expect.any(ObjectId),
      deliveryId,
      orgId: forwardedOrganisationId,
      createdAt: expect.any(String)
    })
  })

  test(`POST /${apiVersion}/movements/{movementId}/collection creates a collection with specialHandlingRequirements`, async ({
    api,
    createMovement,
    movementId
  }) => {
    const { status, body, headers } = await api(
      `/${apiVersion}/movements/${movementId}/collection`,
      {
        method: 'POST',
        body: {
          carrier,
          collectionDateTime,
          collectionSite,
          isDutyOfCareConfirmed,
          specialHandlingRequirements: 'Handle with care and keep upright.'
        }
      }
    )

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body).toEqual({
      data: null,
      validation: { warnings: [] }
    })
    expectStandardHeaders(headers)
  })

  test(`POST /${apiVersion}/deliveries records a delivery with supportingReferences`, async ({
    api,
    createMovement,
    movementId
  }) => {
    const { status, body, headers } = await api(`/${apiVersion}/deliveries`, {
      method: 'POST',
      body: {
        movementIds: [movementId],
        ...deliveryDetails,
        supportingReferences: [supportingReference]
      }
    })

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body.data.deliveries[0].movementIds).toEqual([movementId])
    expectStandardHeaders(headers)
  })

  test(`POST /${apiVersion}/deliveries/{deliveryId}/receipt records a receipt with a brokerOrDealer and supportingReferences`, async ({
    api,
    createMovement,
    movementId
  }) => {
    const createDeliveryRes = await api(`/${apiVersion}/deliveries`, {
      method: 'POST',
      body: { movementIds: [movementId], ...deliveryDetails }
    })
    const { deliveryId } = createDeliveryRes.body.data.deliveries[0]

    const { status, body, headers } = await api(
      `/${apiVersion}/deliveries/${deliveryId}/receipt`,
      {
        method: 'POST',
        body: {
          receiptDateTime,
          carrier,
          receiver,
          physicalDetails,
          treatments,
          brokerOrDealer: { isPresent: true, items: [brokerOrDealerEntry] },
          supportingReferences: [supportingReference]
        }
      }
    )

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body).toEqual({
      data: { deliveryId },
      validation: { warnings: [] }
    })
    expectStandardHeaders(headers)
  })

  test(`POST /${apiVersion}/receipts records an undocumented receipt with a brokerOrDealer and supportingReferences`, async ({
    api
  }) => {
    const { status, body, headers } = await api(`/${apiVersion}/receipts`, {
      method: 'POST',
      body: {
        receiptDateTime,
        reasonForNoDeliveryId: 'No prior movement trail',
        carrier,
        receiver,
        wasteItems: receiptWasteItems,
        brokerOrDealer: { isPresent: true, items: [brokerOrDealerEntry] },
        supportingReferences: [supportingReference]
      }
    })

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body).toEqual({
      data: { deliveryId: expect.any(String) },
      validation: { warnings: [] }
    })
    expectStandardHeaders(headers)
  })

  describe(`${apiVersion} specific error cases`, () => {
    test('rejects collection creation for non-existent movement', async ({
      api
    }) => {
      const endpoint = `/${apiVersion}/movements/25ZZZZZ0/collection`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          carrier,
          collectionDateTime,
          collectionSite,
          isDutyOfCareConfirmed
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.NOT_FOUND,
        type: 'not-found',
        instance: endpoint
      })
    })

    // apiCode is sent in the x-api-code header and resolved by the
    // external API, so the backend rejects it in the body.
    test('rejects collection creation with apiCode in the body', async ({
      api,
      createMovement,
      movementId
    }) => {
      const endpoint = `/${apiVersion}/movements/${movementId}/collection`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          apiCode: apiCode1,
          carrier,
          collectionDateTime,
          collectionSite,
          isDutyOfCareConfirmed
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
    })

    test('rejects collection creation without a carrier', async ({
      api,
      createMovement,
      movementId
    }) => {
      const endpoint = `/${apiVersion}/movements/${movementId}/collection`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {}
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          errorType: 'NotProvided',
          pointer: '/carrier'
        })
      )
    })

    // Scenario: A Collection isn't created when a carrier fails to submit a
    // duty of care.
    test('rejects collection creation without a duty of care confirmation', async ({
      api,
      createMovement,
      movementId
    }) => {
      const endpoint = `/${apiVersion}/movements/${movementId}/collection`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: { carrier, collectionDateTime, collectionSite }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toEqual([
        {
          errorType: 'NotProvided',
          message: "'isDutyOfCareConfirmed' is required",
          pointer: '/isDutyOfCareConfirmed'
        }
      ])
    })

    test('rejects collection creation when a brokerOrDealer is declared with no details', async ({
      api,
      createMovement,
      movementId
    }) => {
      const endpoint = `/${apiVersion}/movements/${movementId}/collection`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          carrier,
          collectionDateTime,
          collectionSite,
          isDutyOfCareConfirmed,
          brokerOrDealer: { isPresent: true }
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          errorType: 'NotProvided',
          pointer: '/brokerOrDealer/items'
        })
      )
    })

    test('rejects collection creation when brokerOrDealer details are given without declaring involvement', async ({
      api,
      createMovement,
      movementId
    }) => {
      const endpoint = `/${apiVersion}/movements/${movementId}/collection`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          carrier,
          collectionDateTime,
          collectionSite,
          isDutyOfCareConfirmed,
          brokerOrDealer: { isPresent: false, items: [brokerOrDealerEntry] }
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          errorType: 'NotAllowed',
          pointer: '/brokerOrDealer/items'
        })
      )
    })

    test('rejects collection creation when a supportingReference has an unrecognised label', async ({
      api,
      createMovement,
      movementId
    }) => {
      const endpoint = `/${apiVersion}/movements/${movementId}/collection`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          carrier,
          collectionDateTime,
          collectionSite,
          isDutyOfCareConfirmed,
          supportingReferences: [
            { ...supportingReference, label: 'Not A Label' }
          ]
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          errorType: 'InvalidValue',
          pointer: '/supportingReferences/0/label'
        })
      )
    })

    test('rejects delivery recording without a carrier', async ({
      api,
      createMovement,
      movementId
    }) => {
      const endpoint = `/${apiVersion}/deliveries`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: { movementIds: [movementId] }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          errorType: 'NotProvided',
          pointer: '/carrier'
        })
      )
    })

    test('rejects delivery recording with missing movementIds', async ({
      api
    }) => {
      const endpoint = `/${apiVersion}/deliveries`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: { carrier }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
    })

    test('rejects delivery recording with non-existent movement', async ({
      api
    }) => {
      const endpoint = `/${apiVersion}/deliveries`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: { movementIds: ['25ZZZZZ0'], ...deliveryDetails }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint
      })
      expect(response.body.detail).toEqual(
        'Movement ID(s) not recognised: 25ZZZZZ0'
      )
    })

    test('rejects receipt recording without a carrier', async ({ api }) => {
      const endpoint = `/${apiVersion}/receipts`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          receiptDateTime,
          reasonForNoDeliveryId: 'Some reasonForNoDeliveryId',
          receiver,
          wasteItems: receiptWasteItems
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          errorType: 'NotProvided',
          pointer: '/carrier'
        })
      )
    })

    test('rejects receipt recording without a receiver', async ({ api }) => {
      const endpoint = `/${apiVersion}/receipts`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          receiptDateTime,
          reasonForNoDeliveryId: 'Some reasonForNoDeliveryId',
          carrier,
          wasteItems: receiptWasteItems
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toEqual([
        {
          errorType: 'NotProvided',
          message: "'receiver' is required",
          pointer: '/receiver'
        }
      ])
    })

    test('rejects receipt recording with a date and time of receipt in the future', async ({
      api
    }) => {
      const endpoint = `/${apiVersion}/receipts`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          receiptDateTime: '2099-01-01T09:00:00Z',
          reasonForNoDeliveryId: 'Some reasonForNoDeliveryId',
          carrier,
          receiver,
          wasteItems: receiptWasteItems
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toEqual([
        {
          errorType: 'OutOfRange',
          message: 'must not be in the future',
          pointer: '/receiptDateTime'
        }
      ])
    })

    test('rejects receipt recording against a delivery without a date and time of receipt', async ({
      api,
      createMovement,
      movementId
    }) => {
      const createDeliveryRes = await api(`/${apiVersion}/deliveries`, {
        method: 'POST',
        body: { movementIds: [movementId], ...deliveryDetails }
      })
      const { deliveryId } = createDeliveryRes.body.data.deliveries[0]

      const endpoint = `/${apiVersion}/deliveries/${deliveryId}/receipt`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          receiptDateTime: '',
          carrier,
          receiver,
          physicalDetails,
          treatments
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toEqual([
        {
          errorType: 'NotProvided',
          message: "'receiptDateTime' is required",
          pointer: '/receiptDateTime'
        }
      ])
    })

    test('rejects receipt recording against a delivery without a receiver', async ({
      api,
      createMovement,
      movementId
    }) => {
      const createDeliveryRes = await api(`/${apiVersion}/deliveries`, {
        method: 'POST',
        body: { movementIds: [movementId], ...deliveryDetails }
      })
      const { deliveryId } = createDeliveryRes.body.data.deliveries[0]

      const endpoint = `/${apiVersion}/deliveries/${deliveryId}/receipt`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          receiptDateTime,
          carrier,
          physicalDetails,
          treatments
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toEqual([
        {
          errorType: 'NotProvided',
          message: "'receiver' is required",
          pointer: '/receiver'
        }
      ])
    })

    test('rejects receipt recording without waste items', async ({ api }) => {
      const endpoint = `/${apiVersion}/receipts`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          receiptDateTime,
          reasonForNoDeliveryId: 'Some reasonForNoDeliveryId',
          carrier,
          receiver
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toEqual([
        {
          errorType: 'NotProvided',
          message: "'wasteItems' is required",
          pointer: '/wasteItems'
        }
      ])
    })

    test('rejects receipt recording against a delivery without treatments', async ({
      api,
      createMovement,
      movementId
    }) => {
      const createDeliveryRes = await api(`/${apiVersion}/deliveries`, {
        method: 'POST',
        body: { movementIds: [movementId], ...deliveryDetails }
      })
      const { deliveryId } = createDeliveryRes.body.data.deliveries[0]

      const endpoint = `/${apiVersion}/deliveries/${deliveryId}/receipt`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: { receiptDateTime, carrier, receiver, physicalDetails }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toEqual([
        {
          errorType: 'NotProvided',
          message: "'treatments' is required",
          pointer: '/treatments'
        }
      ])
    })

    test('rejects receipt recording against a delivery when the total weight is not greater than 0', async ({
      api,
      createMovement,
      movementId
    }) => {
      const createDeliveryRes = await api(`/${apiVersion}/deliveries`, {
        method: 'POST',
        body: { movementIds: [movementId], ...deliveryDetails }
      })
      const { deliveryId } = createDeliveryRes.body.data.deliveries[0]

      const endpoint = `/${apiVersion}/deliveries/${deliveryId}/receipt`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          receiptDateTime,
          carrier,
          receiver,
          physicalDetails: {
            ...physicalDetails,
            totalWeight: { ...physicalDetails.totalWeight, amount: 0 }
          },
          treatments
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toEqual([
        {
          errorType: 'OutOfRange',
          message: 'must be > 0',
          pointer: '/physicalDetails/totalWeight/amount'
        }
      ])
    })

    // apiCode is sent in the x-api-code header and resolved by the
    // external API, so the backend rejects it in the body.
    test('rejects receipt recording with apiCode in the body', async ({
      api
    }) => {
      const endpoint = `/${apiVersion}/receipts`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          receiptDateTime,
          apiCode: apiCode1,
          reasonForNoDeliveryId: 'Some reasonForNoDeliveryId',
          carrier,
          receiver,
          wasteItems: receiptWasteItems
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
    })

    // apiCode is sent in the x-api-code header and resolved by the
    // external API, so the backend rejects it in the body.
    test('rejects apiCode in the movement body', async ({ api }) => {
      const endpoint = `/${apiVersion}/movements`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          apiCode: apiCode1,
          producer: { wasteSource: 'HOUSEHOLD' },
          collectionDateTime,
          collectionSite,
          intendedCarriers,
          intendedReceivers,
          wasteItems
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint
      })
    })

    // Scenario: A Movement isn't created when no intended carrier is declared.
    test('rejects a movement without intended carriers', async ({ api }) => {
      const endpoint = `/${apiVersion}/movements`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          producer: { wasteSource: 'HOUSEHOLD' },
          intendedReceivers,
          wasteItems
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          errorType: 'NotProvided',
          pointer: '/intendedCarriers'
        })
      )
    })

    test('rejects a movement without intended receivers', async ({ api }) => {
      const endpoint = `/${apiVersion}/movements`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          producer: { wasteSource: 'HOUSEHOLD' },
          collectionDateTime,
          collectionSite,
          intendedCarriers,
          wasteItems
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toEqual([
        {
          errorType: 'NotProvided',
          message: "'intendedReceivers' is required",
          pointer: '/intendedReceivers'
        }
      ])
    })

    test('rejects a movement with an empty list of intended receivers', async ({
      api
    }) => {
      const endpoint = `/${apiVersion}/movements`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          apiCode: apiCode1,
          producer: { wasteSource: 'HOUSEHOLD' },
          intendedReceivers: [],
          wasteItems,
          collectionDateTime,
          collectionSite,
          intendedCarriers
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({ pointer: '/intendedReceivers' })
      )
    })

    test('rejects a movement without waste items', async ({ api }) => {
      const endpoint = `/${apiVersion}/movements`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          producer: { wasteSource: 'HOUSEHOLD' },
          collectionDateTime,
          collectionSite,
          intendedCarriers,
          intendedReceivers
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toEqual([
        {
          errorType: 'NotProvided',
          message: "'wasteItems' is required",
          pointer: '/wasteItems'
        }
      ])
    })

    test('rejects a movement whose loose waste item declares containers', async ({
      api
    }) => {
      const endpoint = `/${apiVersion}/movements`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          producer: { wasteSource: 'HOUSEHOLD' },
          collectionDateTime,
          collectionSite,
          intendedCarriers,
          intendedReceivers,
          wasteItems: [
            {
              receiptDateTime,
              physicalDetails: {
                ...wasteItem.physicalDetails,
                containerType: 'LOO',
                containerCount: 1
              }
            }
          ]
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          errorType: 'InvalidValue',
          pointer: '/wasteItems/0/physicalDetails/containerCount'
        })
      )
    })

    test('rejects invalid producer wasteSource', async ({ api }) => {
      const endpoint = `/${apiVersion}/movements`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          collectionDateTime,
          collectionSite,
          intendedCarriers,
          intendedReceivers,
          wasteItems,
          producer: { wasteSource: 'Invalid' }
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint
      })
    })

    test('reports a producer of the wrong type once', async ({ api }) => {
      const endpoint = `/${apiVersion}/movements`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          producer: 'fail',
          collectionDateTime,
          collectionSite,
          intendedCarriers: [carrier],
          intendedReceivers,
          wasteItems
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint
      })
      expect(response.body.errors).toEqual([
        {
          errorType: 'InvalidType',
          message: 'must be object',
          pointer: '/producer'
        }
      ])
    })

    test('rejects commercial producer missing organisationName', async ({
      api
    }) => {
      const endpoint = `/${apiVersion}/movements`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          collectionDateTime,
          collectionSite,
          intendedCarriers,
          intendedReceivers,
          wasteItems,
          producer: {
            wasteSource: 'COMMERCIAL',
            sicCode: '38110',
            authorisationNumber: 'EAS/P/123456',
            address: { fullAddress: 'Test', postcode: 'TE1 2PQ' },
            emailAddress: 'test@example.com'
          }
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint
      })
    })

    test('rejects commercial producer with invalid sicCode format', async ({
      api
    }) => {
      const endpoint = `/${apiVersion}/movements`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          collectionDateTime,
          collectionSite,
          intendedCarriers,
          intendedReceivers,
          wasteItems,
          producer: {
            wasteSource: 'COMMERCIAL',
            organisationName: 'Test Org',
            sicCode: '123',
            authorisationNumber: 'EAS/P/123456',
            address: { fullAddress: 'Test', postcode: 'TE1 2PQ' },
            emailAddress: 'test@example.com'
          }
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint
      })
    })

    test('rejects commercial producer missing both email and phone', async ({
      api
    }) => {
      const endpoint = `/${apiVersion}/movements`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          collectionDateTime,
          collectionSite,
          intendedCarriers,
          intendedReceivers,
          wasteItems,
          producer: {
            wasteSource: 'COMMERCIAL',
            organisationName: 'Test Org',
            sicCode: '38110',
            authorisationNumber: 'EAS/P/123456',
            address: { fullAddress: 'Test', postcode: 'TE1 2PQ' }
          }
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint
      })
    })

    test('rejects commercial producer missing authorisation details', async ({
      api
    }) => {
      const endpoint = `/${apiVersion}/movements`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          collectionDateTime,
          collectionSite,
          intendedCarriers,
          intendedReceivers,
          wasteItems,
          producer: {
            wasteSource: 'COMMERCIAL',
            organisationName: 'Test Org',
            sicCode: '38110',
            address: { fullAddress: 'Test', postcode: 'TE1 2PQ' },
            emailAddress: 'test@example.com'
          }
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint
      })
    })

    test('rejects commercial producer with invalid postcode', async ({
      api
    }) => {
      const endpoint = `/${apiVersion}/movements`
      const response = await api(endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          collectionDateTime,
          collectionSite,
          intendedCarriers,
          intendedReceivers,
          wasteItems,
          producer: {
            wasteSource: 'COMMERCIAL',
            organisationName: 'Test Org',
            sicCode: '38110',
            authorisationNumber: 'EAS/P/123456',
            address: { fullAddress: 'Test', postcode: 'INVALID' },
            emailAddress: 'test@example.com'
          }
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint
      })
    })
  })

  describe('producer payload variants', () => {
    test('household producer with minimal fields', async ({ api }) => {
      const { status, body } = await api(`/${apiVersion}/movements`, {
        method: 'POST',
        body: {
          collectionDateTime,
          collectionSite,
          intendedCarriers,
          intendedReceivers,
          wasteItems,
          producer: { wasteSource: 'HOUSEHOLD' }
        }
      })

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expect(body.data).toHaveProperty('movementId')
    })

    test('municipal producer with full details', async ({ api }) => {
      const { status, body } = await api(`/${apiVersion}/movements`, {
        method: 'POST',
        body: {
          collectionDateTime,
          collectionSite,
          intendedCarriers,
          intendedReceivers,
          wasteItems,
          producer: {
            wasteSource: 'MUNICIPAL',
            organisationName: 'Test Council',
            address: { fullAddress: 'Council Office', postcode: 'TE1 3ST' },
            contactDetails: { phoneNumber: '01234567890' },
            authorisationNumber: 'EAS/P/123456'
          }
        }
      })

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
      expect(body.data).toHaveProperty('movementId')
    })

    test('commercial producer with reasonForNoAuthorisationNumber', async ({
      api
    }) => {
      const { status, body } = await api(`/${apiVersion}/movements`, {
        method: 'POST',
        body: {
          collectionDateTime,
          collectionSite,
          intendedCarriers,
          intendedReceivers,
          wasteItems,
          producer: {
            wasteSource: 'COMMERCIAL',
            organisationName: 'Test Company',
            sicCode: '38110',
            address: { fullAddress: '123 Test St', postcode: 'TE1 2PQ' },
            reasonForNoAuthorisationNumber: 'Exempt operation',
            contactDetails: { emailAddress: 'nobody@gmail.com' }
          }
        }
      })

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
      expect(body.data).toHaveProperty('movementId')
    })
  })
})
