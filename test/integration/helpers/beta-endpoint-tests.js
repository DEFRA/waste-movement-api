import { randomUUID } from 'node:crypto'
import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { expectStandardHeaders } from './expect-standard-headers.js'
import { test } from './fixtures.js'
import { expectResponseBodyHasCorrectShape } from './expect-response-body-has-shape.js'
import { expectProblemResponse } from './expect-problem-response.js'

/**
 * Shared test suite for beta endpoint versions.
 * Parameterised by version, e.g. 'beta-3'. Its tests get the service from the
 * suite's fixtures (see fixtures.js).
 *
 * Usage:
 *   describe(apiVersion, () => {
 *     describeBetaEndpointTests(apiVersion, testData)
 *   })
 */
export function describeBetaEndpointTests(version, testData) {
  const basePath = `/${version}`
  const movementsEndpoint = `${basePath}/movements`

  describe(`${version} - Error Formatting & RFC9457 Compliance`, () => {
    test('returns RFC9457 format for validation errors', async ({ api }) => {
      const response = await api(movementsEndpoint, {
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
    test('rejects a request with no organisation forwarded (unknown or disabled API code)', async ({
      api
    }) => {
      const response = await api(movementsEndpoint, {
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

    test('returns RFC9457 format for missing authentication', async ({
      api
    }) => {
      const response = await api(movementsEndpoint, {
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

    test('returns RFC9457 format for 404 Not Found', async ({ api }) => {
      // Generic 404 test - verify format compliance, not endpoint-specific behavior
      const response = await api(`${basePath}/NONEXISTENT`, {
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
    test('returns problem+json for errors', async ({ api }) => {
      const { status, headers } = await api(movementsEndpoint, {
        method: 'POST',
        body: {}
      })

      expect(status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(headers.get('content-type')).toContain('application/problem+json')
    })

    test('returns json for successful responses', async ({ api }) => {
      const { status, headers } = await api(movementsEndpoint, {
        method: 'POST',
        body: testData.minimalProducer
      })

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expect(headers.get('content-type')).toContain('application/json')
    })
  })

  describe(`${version} - Request Tracing`, () => {
    test('echoes x-cdp-request-id as x-request-id on success responses', async ({
      api
    }) => {
      const traceId = `test-trace-beta${version}`
      const { status, headers } = await api(movementsEndpoint, {
        method: 'POST',
        body: testData.minimalProducer,
        requestId: traceId
      })

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expect(headers.get('x-request-id')).toBe(traceId)
    })

    test('echoes x-cdp-request-id as x-request-id header and returns requestId in body on error responses', async ({
      api
    }) => {
      const traceId = `test-trace-beta${version}`
      const { status, body, headers } = await api(movementsEndpoint, {
        method: 'POST',
        body: {},
        requestId: traceId,
        headers: { foo: 'bar' }
      })

      expect(status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(headers.get('x-request-id')).toBe(traceId)
      expect(body).toEqual(expect.objectContaining({ requestId: traceId }))
    })

    test('generates request ID when not provided', async ({ api }) => {
      const { status, headers, body } = await api(movementsEndpoint, {
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
    test('omits request ID from error responses when not provided', async ({
      api
    }) => {
      const { status, body, headers } = await api(movementsEndpoint, {
        method: 'POST',
        body: {}
      })

      expect(status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(headers.get('x-request-id')).toBeNull()
      expect(body).not.toHaveProperty('requestId')
    })
  })

  describe(`${version} - Standard Headers`, () => {
    test('includes standard security and content headers in success responses', async ({
      api
    }) => {
      const { status, headers } = await api(movementsEndpoint, {
        method: 'POST',
        body: testData.minimalProducer
      })

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expectStandardHeaders(headers)
    })

    test('includes standard security headers in error responses', async ({
      api
    }) => {
      const { status, headers } = await api(movementsEndpoint, {
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
    test('rejects apiCode in the body', async ({ api }) => {
      // apiCode is sent in the x-api-code header, which the external API
      // resolves, so the body has none.
      const response = await api(movementsEndpoint, {
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

    test('rejects missing producer', async ({ api }) => {
      const response = await api(movementsEndpoint, {
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
