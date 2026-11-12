import Hapi from '@hapi/hapi'
import { config } from '#/config.js'
import { createWasteTrackingStub } from '#test/integration/helpers/waste-tracking-stub.js'
import { createDeliveryId, createMovementId } from './waste-tracking.js'

const wasteTrackingIdPattern = /^\d{2}[A-Z0-9]{6,7}$/

describe('waste-tracking-id-backend client', () => {
  const originalUrl = config.get('wasteTrackingUrl')
  let stub

  beforeAll(async () => {
    stub = createWasteTrackingStub()
    await stub.start()
    config.set('wasteTrackingUrl', stub.baseUrl)
  })

  afterEach(() => {
    stub.respondWith()
  })

  afterAll(async () => {
    config.set('wasteTrackingUrl', originalUrl)
    await stub.stop()
  })

  test.each([
    ['createMovementId', createMovementId],
    ['createDeliveryId', createDeliveryId]
  ])('%s mints an ID from GET /next', async (_name, mint) => {
    await expect(mint()).resolves.toMatch(wasteTrackingIdPattern)
  })

  test('is a Bad Gateway when GET /next keeps failing', async () => {
    stub.respondWith({ statusCode: 500 })

    await expect(createMovementId()).rejects.toMatchObject({
      isBoom: true,
      output: { statusCode: 502 },
      message: 'Failed to get a waste tracking ID'
    })
  })

  test('does not pass on the status waste-tracking-id-backend gave', async () => {
    stub.respondWith({ statusCode: 401 })

    await expect(createMovementId()).rejects.toMatchObject({
      output: { statusCode: 502 }
    })
  })

  describe('against a server that answers without an ID', () => {
    let server

    beforeAll(async () => {
      server = Hapi.server({ host: '127.0.0.1', port: 0 })
      server.route({
        method: 'GET',
        path: '/next',
        handler: (request) => ({ headers: request.headers })
      })
      await server.start()
      config.set('wasteTrackingUrl', `http://127.0.0.1:${server.info.port}`)
    })

    afterAll(async () => {
      config.set('wasteTrackingUrl', stub.baseUrl)
      await server.stop()
    })

    test('is a Bad Gateway', async () => {
      await expect(createDeliveryId()).rejects.toMatchObject({
        output: { statusCode: 502 }
      })
    })

    test('sends this service’s Basic credentials', async () => {
      const requests = []
      server.ext('onRequest', (request, h) => {
        requests.push(request.headers.authorization)
        return h.continue
      })
      config.set('serviceAuth.password', 'secret')

      await createDeliveryId().catch(() => {})

      expect(requests[0]).toBe(
        `Basic ${Buffer.from('waste-movement-api:secret').toString('base64')}`
      )
    })
  })
})
