import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { test } from './helpers/fixtures.js'
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
  const createMovement = (api, requestId) =>
    api('/beta-3/movements', {
      method: 'POST',
      body: minimalMovement,
      requestId
    })

  // With no ID minted, nothing is stored either
  const expectBadGateway = async (service, { status, body }, requestId) => {
    expect(status).toEqual(HTTP_STATUS.BAD_GATEWAY)
    expect(body).toEqual({
      type: `${PROBLEM_TYPE_BASE}/bad-gateway`,
      title: 'Bad Gateway',
      detail: 'Failed to get a waste tracking ID',
      instance: '/beta-3/movements',
      requestId
    })
    expect(
      await service.db.collection(movementsCollection).countDocuments()
    ).toBe(0)
  }

  // nextFails and wasteTrackingDown put the stub back after the test, even
  // when it fails, so the next test gets a working one.
  test('POST /beta-3/movements returns a Bad Gateway when GET /next fails', async ({
    api,
    service,
    nextFails
  }) => {
    const response = await createMovement(api, 'test-trace-next-fails')

    await expectBadGateway(service, response, 'test-trace-next-fails')
  })

  test('POST /beta-3/movements returns a Bad Gateway when waste-tracking-id-backend is unreachable', async ({
    api,
    service,
    wasteTrackingDown
  }) => {
    const response = await createMovement(api, 'test-trace-unreachable')

    await expectBadGateway(service, response, 'test-trace-unreachable')
  })
})
