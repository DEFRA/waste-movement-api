import { requestBasicAuthTest1 } from '#test/data/basic-auth.js'
import { organisationHeaders } from '#test/data/organisation-headers.js'

// Deliberately dumb: adds the Basic auth header, sends what it's given and
// returns exactly what crossed the socket - no retries, no unwrapping.
//
// `x-cdp-request-id` is only sent when `requestId` is supplied, so tests can
// exercise the server generating its own request ID.
//
// `body` may be an object (JSON-stringified, sent as application/json) or a
// string (sent as-is with no content-type, so malformed JSON tests must set
// one explicitly). Bodyless requests send no content-type.
export async function httpRequest(
  baseUrl,
  path,
  { method = 'GET', headers = {}, body, auth = true, requestId } = {}
) {
  const isJsonBody = body !== undefined && typeof body !== 'string'

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(isJsonBody ? { 'content-type': 'application/json' } : {}),
      ...(requestId === undefined ? {} : { 'x-cdp-request-id': requestId }),
      ...(auth ? { authorization: `Basic ${requestBasicAuthTest1}` } : {}),
      ...headers
    },
    body: isJsonBody ? JSON.stringify(body) : body
  })

  const text = await response.text()
  let parsedBody = null
  if (text) {
    try {
      parsedBody = JSON.parse(text)
    } catch {
      parsedBody = text
    }
  }

  return {
    status: response.status,
    headers: response.headers,
    body: parsedBody
  }
}

/**
 * httpRequest() as the external API makes it for a beta route: with the
 * organisation that waste-organisation-backend resolved for the apiCode in
 * the x-dwt-organisation-id header. `forwardOrganisation: false` sends no
 * header, as happens for an unknown or disabled API code.
 */
export function betaHttpRequest(
  baseUrl,
  path,
  { forwardOrganisation = true, headers = {}, ...options } = {}
) {
  return httpRequest(baseUrl, path, {
    ...options,
    headers: {
      ...(forwardOrganisation ? organisationHeaders : {}),
      ...headers
    }
  })
}
