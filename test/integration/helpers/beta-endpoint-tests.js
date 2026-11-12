import { randomUUID } from 'node:crypto'
import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { expectStandardHeaders } from './expect-standard-headers.js'
import { betaHttpRequest } from './http.js'
import { expectResponseBodyHasCorrectShape } from './expect-response-body-has-shape.js'
import { expectProblemResponse } from './expect-problem-response.js'

/**
 * Shared test suite for beta endpoint versions.
 * Parameterised by version, e.g. 'beta-3'.
 *
 * Usage:
 *   describe(`beta-${version}`, () => {
 *     let testService, wasteTrackingStub
 *     beforeAll/afterAll setup...
 *     describeBetaEndpointTests(version, testService, testData)
 *   })
 */
export function describeBetaEndpointTests(version, getTestService, testData) {
  const basePath = `/${version}`
  const movementsEndpoint = `${basePath}/movements`

  /**
   * Makes a request against the versioned beta API.
   * @param {string} path - path relative to the version base, e.g. '/movements'
   * @param {object} [options] - options passed through to httpRequest
   */
  const requestBeta = (path, options) =>
    betaHttpRequest(getTestService().baseUrl, `${basePath}${path}`, options)

  describe(`${version} - Error Formatting & RFC9457 Compliance`, () => {
    it('returns RFC9457 format for validation errors', async () => {
      const response = await requestBeta('/movements', {
        method: 'POST',
        requestId: randomUUID(),
        body: {}
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: movementsEndpoint
      })
    })

    // Beta routes rely only on the organisation forwarded by the external API.
    it('rejects a request with no organisation forwarded (unknown or disabled API code)', async () => {
      const response = await requestBeta('/movements', {
        method: 'POST',
        requestId: randomUUID(),
        body: testData.minimalProducer,
        forwardOrganisation: false
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: movementsEndpoint
      })
      expect(response.body.detail).toEqual('the API Code supplied is invalid')
    })

    it('returns RFC9457 format for missing authentication', async () => {
      const response = await requestBeta('/movements', {
        method: 'POST',
        requestId: randomUUID(),
        body: testData.minimalProducer,
        auth: false
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.UNAUTHORIZED,
        type: 'unauthorized',
        instance: movementsEndpoint
      })
    })

    it('returns RFC9457 format for 404 Not Found', async () => {
      // Generic 404 test - verify format compliance, not endpoint-specific behavior
      const response = await requestBeta('/NONEXISTENT', {
        method: 'GET',
        requestId: randomUUID()
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.NOT_FOUND,
        type: 'not-found',
        instance: `${basePath}/NONEXISTENT`
      })
    })
  })

  describe(`${version} - Content Negotiation`, () => {
    it('returns problem+json for errors', async () => {
      const { status, headers } = await requestBeta('/movements', {
        method: 'POST',
        body: {}
      })

      expect(status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(headers.get('content-type')).toContain('application/problem+json')
    })

    it('returns json for successful responses', async () => {
      const { status, headers } = await requestBeta('/movements', {
        method: 'POST',
        body: testData.minimalProducer
      })

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expect(headers.get('content-type')).toContain('application/json')
    })
  })

  describe(`${version} - Request Tracing`, () => {
    it('echoes x-cdp-request-id as x-request-id on success responses', async () => {
      const traceId = `test-trace-beta${version}`
      const { status, headers } = await requestBeta('/movements', {
        method: 'POST',
        body: testData.minimalProducer,
        requestId: traceId
      })

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expect(headers.get('x-request-id')).toBe(traceId)
    })

    it('echoes x-cdp-request-id as x-request-id header and returns requestId in body on error responses', async () => {
      const traceId = `test-trace-beta${version}`
      const { status, body, headers } = await requestBeta('/movements', {
        method: 'POST',
        body: {},
        requestId: traceId,
        headers: { foo: 'bar' }
      })

      expect(status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(headers.get('x-request-id')).toBe(traceId)
      expect(body).toEqual(expect.objectContaining({ requestId: traceId }))
    })

    it('generates request ID when not provided', async () => {
      const { status, headers, body } = await requestBeta('/movements', {
        method: 'POST',
        body: testData.minimalProducer
      })

      expect(status).toEqual(HTTP_STATUS.CREATED)
      // No x-cdp-request-id sent, so the server must generate a UUID
      expect(headers.get('x-request-id')).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
      expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    })

    // Unlike success responses, error responses don't fall back to a
    // generated ID: the shared error formatter only includes one when
    // x-cdp-request-id was sent. Accepted because CDP always sends that
    // header in deployed environments, so every other error test supplies one.
    it('omits request ID from error responses when not provided', async () => {
      const { status, body, headers } = await requestBeta('/movements', {
        method: 'POST',
        body: {}
      })

      expect(status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(headers.get('x-request-id')).toBeNull()
      expect(body).not.toHaveProperty('requestId')
    })
  })

  describe(`${version} - Standard Headers`, () => {
    it('includes standard security and content headers in success responses', async () => {
      const { status, headers } = await requestBeta('/movements', {
        method: 'POST',
        body: testData.minimalProducer
      })

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expectStandardHeaders(headers)
    })

    it('includes standard security headers in error responses', async () => {
      const { status, headers } = await requestBeta('/movements', {
        method: 'POST',
        body: {}
      })

      expect(status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expectStandardHeaders(headers, {
        contentType: 'application/problem+json'
      })
    })
  })

  describe(`${version} - Missing Required Fields`, () => {
    it('rejects apiCode in the body', async () => {
      // apiCode is sent in the x-api-code header, which the external API
      // resolves, so the body has none.
      const response = await requestBeta('/movements', {
        method: 'POST',
        requestId: randomUUID(),
        body: { apiCode: testData.apiCode1, ...testData.minimalProducer }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: movementsEndpoint
      })
    })

    it('rejects missing producer', async () => {
      const response = await requestBeta('/movements', {
        method: 'POST',
        requestId: randomUUID(),
        body: {}
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: movementsEndpoint
      })
    })
  })
}
