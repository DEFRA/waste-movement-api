import { createServer } from '#/server.js'

describe('#router', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('registers /health and the beta-3 routes, and nothing else', () => {
    const routes = server
      .table()
      .map(({ method, path }) => `${method.toUpperCase()} ${path}`)
      .sort()

    expect(routes).toEqual([
      'GET /health',
      'POST /beta-3/deliveries',
      'POST /beta-3/deliveries/{deliveryId}/receipt',
      'POST /beta-3/movements',
      'POST /beta-3/movements/{movementId}/collection',
      'POST /beta-3/receipts'
    ])
  })

  test('requires Basic auth on every route but /health', async () => {
    const statusWithoutAuth = async ({ method, path }) => {
      const { statusCode } = await server.inject({ method, url: path })
      return [path, statusCode]
    }

    const statuses = await Promise.all(server.table().map(statusWithoutAuth))

    expect(Object.fromEntries(statuses)).toEqual({
      '/health': 200,
      '/beta-3/deliveries': 401,
      '/beta-3/deliveries/{deliveryId}/receipt': 401,
      '/beta-3/movements': 401,
      '/beta-3/movements/{movementId}/collection': 401,
      '/beta-3/receipts': 401
    })
  })
})
