import Boom from '@hapi/boom'
import Wreck from '@hapi/wreck'
import { withTraceId } from '@defra/hapi-tracing'
import { backOff } from 'exponential-backoff'
import { config } from '#/config.js'
import { createLogger } from '#/common/helpers/logging/logger.js'

const logger = createLogger()

const timeoutMs = 5000
const retryOptions = { numOfAttempts: 3, startingDelay: 200 }

const authorization = () => {
  const { username, password } = config.get('serviceAuth')
  const credentials = Buffer.from(`${username}:${password}`).toString('base64')
  return `Basic ${credentials}`
}

const getNext = async () => {
  const { payload } = await Wreck.get(
    `${config.get('wasteTrackingUrl')}/next`,
    {
      json: 'strict',
      timeout: timeoutMs,
      headers: withTraceId(config.get('tracing.header'), {
        authorization: authorization()
      })
    }
  )

  if (typeof payload?.wasteTrackingId !== 'string') {
    throw new Error('Response has no wasteTrackingId')
  }
  return payload.wasteTrackingId
}

/**
 * Mints a new unique ID from waste-tracking-id-backend's `GET /next`,
 * retrying a couple of times. Any failure to get one — no answer, an error
 * status or a body without an ID — is a 502: the problem is upstream, not in
 * the caller's request, and its own status (e.g. a 401 for our credentials)
 * must not be passed on as if it were.
 *
 * The URL is read on every call, so tests can point it at a stub after this
 * module has loaded.
 *
 * @returns {Promise<string>}
 */
const nextWasteTrackingId = async () => {
  try {
    return await backOff(getNext, retryOptions)
  } catch (error) {
    logger.error({ err: error }, 'Failed to get a waste tracking ID')
    throw Boom.badGateway('Failed to get a waste tracking ID')
  }
}

export const createMovementId = () => nextWasteTrackingId()

export const createDeliveryId = () => nextWasteTrackingId()
