import { test as base } from 'vitest'
import { betaHttpRequest, httpRequest } from './http.js'
import { startTestService } from './test-service.js'
import { createWasteTrackingStub } from './waste-tracking-stub.js'

// The suite's Vitest fixtures (https://vitest.dev/guide/test-context.html).
// A test names what it needs, e.g. `test('...', async ({ api }) => ...)`, and
// gets it set up for it, then torn down after it, even when it fails.
export const test = base.extend({
  // The stand-in for waste-tracking-id-backend, one per file
  wasteTracking: [
    // Vitest reads a fixture's dependencies from its destructured context,
    // so one with none needs an empty pattern.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const stub = createWasteTrackingStub()
      await stub.start()
      await use(stub)
      await stub.stop()
    },
    { scope: 'file' }
  ],

  // The service under test, one per file, minting its IDs from the stub
  service: [
    async ({ wasteTracking }, use) => {
      const service = await startTestService({
        wasteTrackingUrl: wasteTracking.baseUrl
      })
      await use(service)
      await service.stop()
    },
    { scope: 'file' }
  ],

  // httpRequest() against the service, e.g. http('/health')
  http: async ({ service }, use) => {
    await use((path, options) => httpRequest(service.baseUrl, path, options))
  },

  // betaHttpRequest() against the service: a request as the external API
  // makes it, e.g. api('/beta-3/movements', { method: 'POST', body })
  api: async ({ service }, use) => {
    await use((path, options) =>
      betaHttpRequest(service.baseUrl, path, options)
    )
  },

  // GET /next fails with a 500 for the length of the test
  nextFails: async ({ wasteTracking }, use) => {
    wasteTracking.respondWith({ statusCode: 500 })
    await use()
    wasteTracking.respondWith()
  },

  // waste-tracking-id-backend is unreachable for the length of the test
  wasteTrackingDown: async ({ wasteTracking }, use) => {
    await wasteTracking.stop()
    await use()
    await wasteTracking.start()
  }
})
