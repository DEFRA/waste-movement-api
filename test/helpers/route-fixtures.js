import { test as base } from 'vitest'
import { userBasicAuthTest1 } from '#test/data/basic-auth.js'
import { createServer } from '#/server.js'

// Vitest fixtures (https://vitest.dev/guide/test-context.html) for route
// tests, which call the server with server.inject(). A test names what it
// needs, e.g. `test('...', async ({ server }) => ...)`. A route test file
// extends this with its own, e.g. a `submit` for its route.
export const test = base.extend({
  // The server, one per file, initialised but not listening
  server: [
    // Vitest reads a fixture's dependencies from its destructured context,
    // so one with none needs an empty pattern.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      process.env.ACCESS_CRED_TEST1 = userBasicAuthTest1

      const server = await createServer()
      await server.initialize()
      await use(server)
      await server.stop()
    },
    { scope: 'file' }
  ]
})
