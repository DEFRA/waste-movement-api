import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { test } from './helpers/fixtures.js'
import { expectStandardHeaders } from './helpers/expect-standard-headers.js'
import { expectProblemResponse } from './helpers/expect-problem-response.js'

const requestId = 'test-trace-errors'

// Every error from this service is an RFC 9457 problem response, whatever the
// route: there is no older error shape to keep, as there is for the Phase 1
// routes in waste-movement-backend.
describe('errors', () => {
  test('returns 401 when no Authorization header is sent on a protected route', async ({
    api
  }) => {
    const response = await api('/beta-3/movements', {
      method: 'POST',
      auth: false,
      requestId,
      body: {}
    })

    expectProblemResponse(response, {
      status: HTTP_STATUS.UNAUTHORIZED,
      type: 'unauthorized',
      instance: '/beta-3/movements'
    })
    expect(response.body.detail).toEqual('Missing authentication')
    expectStandardHeaders(response.headers, {
      contentType: 'application/problem+json'
    })
  })

  test('returns 401 for credentials that are not recognised', async ({
    api
  }) => {
    const response = await api('/beta-3/movements', {
      method: 'POST',
      auth: false,
      requestId,
      headers: {
        authorization: `Basic ${Buffer.from('test1:wrong').toString('base64')}`
      },
      body: {}
    })

    expectProblemResponse(response, {
      status: HTTP_STATUS.UNAUTHORIZED,
      type: 'unauthorized',
      instance: '/beta-3/movements'
    })
  })

  test('returns 400 with an errors[] entry per problem when the payload is invalid', async ({
    api
  }) => {
    const response = await api('/beta-3/deliveries', {
      method: 'POST',
      requestId,
      body: { movementIds: [] }
    })

    expectProblemResponse(response, {
      status: HTTP_STATUS.BAD_REQUEST,
      type: 'bad-request',
      instance: '/beta-3/deliveries',
      shape: 'VALIDATION-ERROR'
    })
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        {
          errorType: 'NotProvided',
          message: "'carrier' is required",
          pointer: '/carrier'
        }
      ])
    )
  })

  test('returns 400 for malformed JSON in the request body', async ({
    api
  }) => {
    const response = await api('/beta-3/movements', {
      method: 'POST',
      requestId,
      headers: { 'content-type': 'application/json' },
      body: '{'
    })

    expectProblemResponse(response, {
      status: HTTP_STATUS.BAD_REQUEST,
      type: 'bad-request',
      instance: '/beta-3/movements'
    })
    expect(response.body.detail).toEqual('Invalid request payload JSON format')
  })

  test('returns 404 for an unknown path', async ({ http }) => {
    const response = await http('/this-route-does-not-exist', { requestId })

    expectProblemResponse(response, {
      status: HTTP_STATUS.NOT_FOUND,
      type: 'not-found',
      instance: '/this-route-does-not-exist'
    })
    expectStandardHeaders(response.headers, {
      contentType: 'application/problem+json'
    })
  })
})
