import { randomUUID } from 'node:crypto'
import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { startTestService } from '#test/integration/helpers/test-service.js'
import { createWasteTrackingStub } from '#test/integration/helpers/waste-tracking-stub.js'
import { betaHttpRequest } from '#test/integration/helpers/http.js'
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
import { versionedCollections } from '#/common/data/versioned-collections.js'
import { DATA_REVISION } from '../data/revision.js'

const collectionName = versionedCollections('beta-3', DATA_REVISION)

describe('beta-3', () => {
  let testService
  let wasteTrackingStub
  const version = 'beta-3'
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

  beforeAll(async () => {
    wasteTrackingStub = createWasteTrackingStub()
    await wasteTrackingStub.start()
    testService = await startTestService({
      wasteTrackingUrl: wasteTrackingStub.baseUrl
    })
  })

  afterAll(async () => {
    await testService.stop()
    await wasteTrackingStub.stop()
  })

  const createMovement = async (overrides = {}) => {
    const { body } = await betaHttpRequest(
      testService.baseUrl,
      '/beta-3/movements',
      {
        method: 'POST',
        body: { ...minimalMovement, ...overrides }
      }
    )
    return body.data.movementId
  }

  // Shared error formatting and RFC9457 compliance tests
  describeBetaEndpointTests(version, () => testService, {
    apiCode1,
    minimalProducer: minimalMovement
  })

  describe('POST /beta-3/movements', () => {
    it('creates a movement with minimal payload', async () => {
      const producer = { wasteSource: 'HOUSEHOLD' }
      const { status, body, headers } = await betaHttpRequest(
        testService.baseUrl,
        '/beta-3/movements',
        {
          method: 'POST',
          body: {
            producer,
            collectionDateTime,
            collectionSite,
            intendedCarriers,
            intendedReceivers,
            wasteItems
          }
        }
      )

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
      expect(body).toEqual({
        data: { movementId: expect.any(String) },
        validation: { warnings: [] }
      })
      expectStandardHeaders(headers)

      const { movementId } = body.data
      const movement = await testService.db
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

    it('creates a movement with producer payload', async () => {
      const producer = { wasteSource: 'HOUSEHOLD' }
      const { status, body, headers } = await betaHttpRequest(
        testService.baseUrl,
        '/beta-3/movements',
        {
          method: 'POST',
          body: {
            producer,
            collectionDateTime,
            collectionSite,
            intendedCarriers,
            intendedReceivers,
            wasteItems
          }
        }
      )

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
      expect(body).toMatchObject({
        data: { movementId: expect.any(String) },
        validation: { warnings: [] }
      })
      expectStandardHeaders(headers)

      const { movementId } = body.data
      const movement = await testService.db
        .collection(collectionName('movements'))
        .findOne({ movementId })

      expect(movement).toMatchObject({
        _id: expect.any(ObjectId),
        movementId,
        orgId: forwardedOrganisationId,
        createdAt: expect.any(String)
      })
    })

    it('creates a movement with commercial producer', async () => {
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
      const { status, body, headers } = await betaHttpRequest(
        testService.baseUrl,
        '/beta-3/movements',
        {
          method: 'POST',
          body: {
            producer,
            collectionDateTime,
            collectionSite,
            intendedCarriers,
            intendedReceivers,
            wasteItems
          }
        }
      )

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
      expect(body).toMatchObject({
        data: { movementId: expect.any(String) },
        validation: { warnings: [] }
      })
      expectStandardHeaders(headers)

      const { movementId } = body.data
      const movement = await testService.db
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

  it('POST /beta-3/movements/{movementId}/collection creates a collection', async () => {
    const createRes = await betaHttpRequest(
      testService.baseUrl,
      '/beta-3/movements',
      {
        method: 'POST',
        body: { ...minimalMovement }
      }
    )
    const { movementId } = createRes.body.data

    const { status, body, headers } = await betaHttpRequest(
      testService.baseUrl,
      `/beta-3/movements/${movementId}/collection`,
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

    const movement = await testService.db
      .collection(collectionName('movements'))
      .findOne({ movementId })

    expect(movement).toMatchObject({
      movementId,
      orgId: forwardedOrganisationId,
      createdAt: expect.any(String)
    })
  })

  it('POST /beta-3/movements/{movementId}/collection creates a collection with a brokerOrDealer and supportingReferences', async () => {
    const movementId = await createMovement()

    const { status, body, headers } = await betaHttpRequest(
      testService.baseUrl,
      `/beta-3/movements/${movementId}/collection`,
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

  it('POST /beta-3/deliveries records a delivery', async () => {
    const createRes = await betaHttpRequest(
      testService.baseUrl,
      '/beta-3/movements',
      {
        method: 'POST',
        body: { ...minimalMovement }
      }
    )
    const { movementId } = createRes.body.data

    const { status, body, headers } = await betaHttpRequest(
      testService.baseUrl,
      '/beta-3/deliveries',
      {
        method: 'POST',
        body: { movementIds: [movementId], ...deliveryDetails }
      }
    )

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body.data.deliveries).toHaveLength(1)
    expect(body.data.deliveries[0].movementIds).toEqual([movementId])
    expectStandardHeaders(headers)

    const { deliveryId } = body.data.deliveries[0]
    const delivery = await testService.db
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

  it('POST /beta-3/movements stores a hazardous waste item', async () => {
    const movementId = await createMovement(hazardousMovement)

    const movement = await testService.db
      .collection(collectionName('movements'))
      .findOne({ movementId })

    expect(movement).toMatchObject({
      movementId,
      wasteItems: [hazardousWasteItem]
    })
    expect(movement).not.toHaveProperty('wasteType')
  })

  it('POST /beta-3/deliveries splits hazardous movements into their own deliveries', async () => {
    const nonHazardousId1 = await createMovement()
    const hazardousId = await createMovement(hazardousMovement)
    const nonHazardousId2 = await createMovement()

    const { status, body } = await betaHttpRequest(
      testService.baseUrl,
      '/beta-3/deliveries',
      {
        method: 'POST',
        body: {
          movementIds: [nonHazardousId1, hazardousId, nonHazardousId2],
          ...deliveryDetails
        }
      }
    )

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

    const deliveries = await testService.db
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

  it('POST /beta-3/deliveries/{deliveryId}/receipt records a receipt against a delivery', async () => {
    const createMovementRes = await betaHttpRequest(
      testService.baseUrl,
      '/beta-3/movements',
      {
        method: 'POST',
        body: { ...minimalMovement }
      }
    )
    const { movementId } = createMovementRes.body.data

    const createDeliveryRes = await betaHttpRequest(
      testService.baseUrl,
      '/beta-3/deliveries',
      {
        method: 'POST',
        body: { movementIds: [movementId], ...deliveryDetails }
      }
    )
    const { deliveryId } = createDeliveryRes.body.data.deliveries[0]

    const { status, body, headers } = await betaHttpRequest(
      testService.baseUrl,
      `/beta-3/deliveries/${deliveryId}/receipt`,
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

    const delivery = await testService.db
      .collection(collectionName('deliveries'))
      .findOne({ deliveryId })

    expect(delivery).toMatchObject({
      deliveryId,
      orgId: forwardedOrganisationId,
      movementIds: [movementId],
      createdAt: expect.any(String)
    })
  })

  it('POST /beta-3/receipts records an undocumented receipt', async () => {
    const reasonForNoDeliveryId = 'No prior movement trail'
    const { status, body, headers } = await betaHttpRequest(
      testService.baseUrl,
      '/beta-3/receipts',
      {
        method: 'POST',
        body: {
          receiptDateTime,
          reasonForNoDeliveryId,
          carrier,
          receiver,
          wasteItems: receiptWasteItems
        }
      }
    )

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body).toEqual({
      data: { deliveryId: expect.any(String) },
      validation: { warnings: [] }
    })
    expectStandardHeaders(headers)

    const { deliveryId } = body.data
    const delivery = await testService.db
      .collection(collectionName('deliveries'))
      .findOne({ deliveryId })

    expect(delivery).toMatchObject({
      _id: expect.any(ObjectId),
      deliveryId,
      orgId: forwardedOrganisationId,
      createdAt: expect.any(String)
    })
  })

  it('POST /beta-3/movements/{movementId}/collection creates a collection with specialHandlingRequirements', async () => {
    const movementId = await createMovement()

    const { status, body, headers } = await betaHttpRequest(
      testService.baseUrl,
      `/beta-3/movements/${movementId}/collection`,
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

  it('POST /beta-3/deliveries records a delivery with supportingReferences', async () => {
    const movementId = await createMovement()

    const { status, body, headers } = await betaHttpRequest(
      testService.baseUrl,
      '/beta-3/deliveries',
      {
        method: 'POST',
        body: {
          movementIds: [movementId],
          ...deliveryDetails,
          supportingReferences: [supportingReference]
        }
      }
    )

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body.data.deliveries[0].movementIds).toEqual([movementId])
    expectStandardHeaders(headers)
  })

  it('POST /beta-3/deliveries/{deliveryId}/receipt records a receipt with a brokerOrDealer and supportingReferences', async () => {
    const movementId = await createMovement()
    const createDeliveryRes = await betaHttpRequest(
      testService.baseUrl,
      '/beta-3/deliveries',
      {
        method: 'POST',
        body: { movementIds: [movementId], ...deliveryDetails }
      }
    )
    const { deliveryId } = createDeliveryRes.body.data.deliveries[0]

    const { status, body, headers } = await betaHttpRequest(
      testService.baseUrl,
      `/beta-3/deliveries/${deliveryId}/receipt`,
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

  it('POST /beta-3/receipts records an undocumented receipt with a brokerOrDealer and supportingReferences', async () => {
    const { status, body, headers } = await betaHttpRequest(
      testService.baseUrl,
      '/beta-3/receipts',
      {
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
      }
    )

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body).toEqual({
      data: { deliveryId: expect.any(String) },
      validation: { warnings: [] }
    })
    expectStandardHeaders(headers)
  })

  describe('beta-3 specific error cases', () => {
    it('rejects collection creation for non-existent movement', async () => {
      const endpoint = '/beta-3/movements/25ZZZZZ0/collection'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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
    it('rejects collection creation with apiCode in the body', async () => {
      const movementId = await createMovement()
      const endpoint = `/beta-3/movements/${movementId}/collection`
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects collection creation without a carrier', async () => {
      const movementId = await createMovement()
      const endpoint = `/beta-3/movements/${movementId}/collection`
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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
    it('rejects collection creation without a duty of care confirmation', async () => {
      const movementId = await createMovement()
      const endpoint = `/beta-3/movements/${movementId}/collection`
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects collection creation when a brokerOrDealer is declared with no details', async () => {
      const movementId = await createMovement()
      const endpoint = `/beta-3/movements/${movementId}/collection`
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects collection creation when brokerOrDealer details are given without declaring involvement', async () => {
      const movementId = await createMovement()
      const endpoint = `/beta-3/movements/${movementId}/collection`
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects collection creation when a supportingReference has an unrecognised label', async () => {
      const movementId = await createMovement()
      const endpoint = `/beta-3/movements/${movementId}/collection`
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects delivery recording without a carrier', async () => {
      const movementId = await createMovement()
      const endpoint = '/beta-3/deliveries'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects delivery recording with missing movementIds', async () => {
      const endpoint = '/beta-3/deliveries'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects delivery recording with non-existent movement', async () => {
      const endpoint = '/beta-3/deliveries'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects receipt recording without a carrier', async () => {
      const endpoint = '/beta-3/receipts'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects receipt recording without a receiver', async () => {
      const endpoint = '/beta-3/receipts'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects receipt recording with a date and time of receipt in the future', async () => {
      const endpoint = '/beta-3/receipts'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects receipt recording against a delivery without a date and time of receipt', async () => {
      const movementId = await createMovement()
      const createDeliveryRes = await betaHttpRequest(
        testService.baseUrl,
        '/beta-3/deliveries',
        {
          method: 'POST',
          body: { movementIds: [movementId], ...deliveryDetails }
        }
      )
      const { deliveryId } = createDeliveryRes.body.data.deliveries[0]

      const endpoint = `/beta-3/deliveries/${deliveryId}/receipt`
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects receipt recording against a delivery without a receiver', async () => {
      const movementId = await createMovement()
      const createDeliveryRes = await betaHttpRequest(
        testService.baseUrl,
        '/beta-3/deliveries',
        {
          method: 'POST',
          body: { movementIds: [movementId], ...deliveryDetails }
        }
      )
      const { deliveryId } = createDeliveryRes.body.data.deliveries[0]

      const endpoint = `/beta-3/deliveries/${deliveryId}/receipt`
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects receipt recording without waste items', async () => {
      const endpoint = '/beta-3/receipts'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects receipt recording against a delivery without treatments', async () => {
      const movementId = await createMovement()
      const createDeliveryRes = await betaHttpRequest(
        testService.baseUrl,
        '/beta-3/deliveries',
        {
          method: 'POST',
          body: { movementIds: [movementId], ...deliveryDetails }
        }
      )
      const { deliveryId } = createDeliveryRes.body.data.deliveries[0]

      const endpoint = `/beta-3/deliveries/${deliveryId}/receipt`
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects receipt recording against a delivery when the total weight is not greater than 0', async () => {
      const movementId = await createMovement()
      const createDeliveryRes = await betaHttpRequest(
        testService.baseUrl,
        '/beta-3/deliveries',
        {
          method: 'POST',
          body: { movementIds: [movementId], ...deliveryDetails }
        }
      )
      const { deliveryId } = createDeliveryRes.body.data.deliveries[0]

      const endpoint = `/beta-3/deliveries/${deliveryId}/receipt`
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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
    it('rejects receipt recording with apiCode in the body', async () => {
      const endpoint = '/beta-3/receipts'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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
    it('rejects apiCode in the movement body', async () => {
      const endpoint = '/beta-3/movements'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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
    it('rejects a movement without intended carriers', async () => {
      const endpoint = '/beta-3/movements'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects a movement without intended receivers', async () => {
      const endpoint = '/beta-3/movements'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects a movement with an empty list of intended receivers', async () => {
      const endpoint = '/beta-3/movements'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects a movement without waste items', async () => {
      const endpoint = '/beta-3/movements'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects a movement whose loose waste item declares containers', async () => {
      const endpoint = '/beta-3/movements'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects invalid producer wasteSource', async () => {
      const endpoint = '/beta-3/movements'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('reports a producer of the wrong type once', async () => {
      const endpoint = '/beta-3/movements'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects commercial producer missing organisationName', async () => {
      const endpoint = '/beta-3/movements'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects commercial producer with invalid sicCode format', async () => {
      const endpoint = '/beta-3/movements'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects commercial producer missing both email and phone', async () => {
      const endpoint = '/beta-3/movements'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects commercial producer missing authorisation details', async () => {
      const endpoint = '/beta-3/movements'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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

    it('rejects commercial producer with invalid postcode', async () => {
      const endpoint = '/beta-3/movements'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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
    it('household producer with minimal fields', async () => {
      const { status, body } = await betaHttpRequest(
        testService.baseUrl,
        '/beta-3/movements',
        {
          method: 'POST',
          body: {
            collectionDateTime,
            collectionSite,
            intendedCarriers,
            intendedReceivers,
            wasteItems,
            producer: { wasteSource: 'HOUSEHOLD' }
          }
        }
      )

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expect(body.data).toHaveProperty('movementId')
    })

    it('municipal producer with full details', async () => {
      const { status, body } = await betaHttpRequest(
        testService.baseUrl,
        '/beta-3/movements',
        {
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
        }
      )

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
      expect(body.data).toHaveProperty('movementId')
    })

    it('commercial producer with reasonForNoAuthorisationNumber', async () => {
      const { status, body } = await betaHttpRequest(
        testService.baseUrl,
        '/beta-3/movements',
        {
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
        }
      )

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
      expect(body.data).toHaveProperty('movementId')
    })
  })
})
