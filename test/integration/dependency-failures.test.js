import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { startTestService } from './helpers/test-service.js'
import { createWasteTrackingStub } from './helpers/waste-tracking-stub.js'
import { betaHttpRequest } from './helpers/http.js'
import { PROBLEM_TYPE_BASE } from './helpers/problem-types.js'
import {
  carrier,
  collectionDateTime,
  collectionSite,
  receiver,
  wasteItem
} from '#/versions/beta-3/schemas/test-helpers.js'
import { DATA_REVISION } from '#/versions/beta-3/data/revision.js'
import { versionedCollections } from '#/common/data/versioned-collections.js'

const movementsCollection = versionedCollections(
  'beta-3',
  DATA_REVISION
)('movements')

const minimalMovement = {
  producer: { wasteSource: 'HOUSEHOLD' },
  collectionDateTime,
  collectionSite,
  intendedCarriers: [carrier],
  intendedReceivers: [receiver],
  wasteItems: [wasteItem]
}

// Isolated in its own file: forcing waste-tracking-id-backend failures is
// shared, process-wide state, and each case pays for the client's retries, so
// this is kept to the minimum needed to prove failures actually propagate as
// HTTP errors rather than being silently swallowed.
describe('dependency failures', () => {
  let testService
  let wasteTrackingStub

  const createMovement = (requestId) =>
    betaHttpRequest(testService.baseUrl, '/beta-3/movements', {
      method: 'POST',
      body: minimalMovement,
      requestId
    })

  // With no ID minted, nothing is stored either
  const expectBadGateway = async ({ status, body }, requestId) => {
    expect(status).toEqual(HTTP_STATUS.BAD_GATEWAY)
    expect(body).toEqual({
      type: `${PROBLEM_TYPE_BASE}/bad-gateway`,
      title: 'Bad Gateway',
      detail: 'Failed to get a waste tracking ID',
      instance: '/beta-3/movements',
      requestId
    })
    expect(
      await testService.db.collection(movementsCollection).countDocuments()
    ).toBe(0)
  }

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

  it('POST /beta-3/movements returns a Bad Gateway when GET /next fails', async () => {
    wasteTrackingStub.respondWith({ statusCode: 500 })

    const response = await createMovement('test-trace-next-fails')

    wasteTrackingStub.respondWith()

    await expectBadGateway(response, 'test-trace-next-fails')
  })

  it('POST /beta-3/movements returns a Bad Gateway when waste-tracking-id-backend is unreachable', async () => {
    await wasteTrackingStub.stop()

    const response = await createMovement('test-trace-unreachable')

    await wasteTrackingStub.start()

    await expectBadGateway(response, 'test-trace-unreachable')
  })
})
