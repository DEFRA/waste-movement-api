import { startTestService } from './helpers/test-service.js'
import { httpRequest } from './helpers/http.js'
import { expectStandardHeaders } from './helpers/expect-standard-headers.js'

describe('GET /health', () => {
  let testService

  beforeAll(async () => {
    testService = await startTestService()
  })

  afterAll(async () => {
    await testService.stop()
  })

  it('returns 200 without authentication', async () => {
    const { status, body, headers } = await httpRequest(
      testService.baseUrl,
      '/health',
      {
        auth: false
      }
    )

    expect(status).toEqual(200)
    expect(body).toEqual({ message: 'success' })
    expectStandardHeaders(headers)
  })
})
