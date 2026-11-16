import { test } from './helpers/fixtures.js'
import { expectStandardHeaders } from './helpers/expect-standard-headers.js'

describe('GET /health', () => {
  test('returns 200 without authentication', async ({ http }) => {
    const { status, body, headers } = await http('/health', { auth: false })

    expect(status).toEqual(200)
    expect(body).toEqual({ message: 'success' })
    expectStandardHeaders(headers)
  })
})
