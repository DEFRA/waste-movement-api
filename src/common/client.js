import { HTTP_STATUS } from '@defra/waste-movement-utils'

/**
 * Headers the external API uses to forward the software provider that made
 * the request: the `client_id` of its Cognito token, on every call, and the
 * name the software provider details service has for it, URI-encoded, on
 * beta calls when that lookup succeeded.
 */
export const CLIENT_ID_HEADER = 'x-dwt-client-id'
export const CLIENT_NAME_HEADER = 'x-dwt-client-name'

/**
 * A request without a client ID. The external API rejects a token without
 * one, so it's a fault between the two services, not something the software
 * provider can fix: a 500, not a 400.
 */
export class MissingClientError extends Error {
  constructor() {
    super(`The ${CLIENT_ID_HEADER} header is missing`)
    this.name = 'MissingClientError'
    this.statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR
  }
}

const isBlank = (value) => typeof value !== 'string' || value.trim() === ''

// A malformed encoding is kept as sent: it's only stored, to debug with
const decoded = (value) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Returns the software provider the external API forwarded for this request.
 *
 * @param {object} request - Hapi request (header names are lower-cased)
 * @returns {{ clientId: string, clientName: string | null }} `clientName` is
 * null when the external API couldn't look it up
 */
export const getClient = (request) => {
  const clientId = request?.headers?.[CLIENT_ID_HEADER]
  const clientName = request?.headers?.[CLIENT_NAME_HEADER]

  if (isBlank(clientId)) {
    throw new MissingClientError()
  }

  return {
    clientId,
    clientName: isBlank(clientName) ? null : decoded(clientName)
  }
}
