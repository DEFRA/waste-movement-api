import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { isDuplicateKeyError } from './duplicate-key.js'
import { hashPayload } from './payload.js'

/**
 * A different request than the one already stored under the same unique key:
 * a 409, through the route's error handling.
 */
export class AlreadyStoredError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AlreadyStoredError'
    this.statusCode = HTTP_STATUS.CONFLICT
  }
}

/**
 * Runs an insert into a collection with a unique index, for an entity that's
 * recorded once (e.g. a Movement's Collection). When the key is already
 * taken, the stored document decides: the same organisation's same payload
 * is the request resubmitted, e.g. a retry after a lost response, so it
 * succeeds again without storing anything; anything else is an
 * AlreadyStoredError.
 *
 * @param {object} logger
 * @param {object} options
 * @param {() => Promise<unknown>} options.insert
 * @param {() => Promise<{ orgId: string, payloadHash: string } | null>} options.findStored -
 * the document holding the unique key
 * @param {{ orgId: string, payload: unknown }} options.request
 * @param {string} options.conflictMessage - the 409's detail
 * @param {object} [options.context] - logged with the outcome, e.g. `{ movementId }`
 */
export const insertOnce = async (
  logger,
  { insert, findStored, request, conflictMessage, context = {} }
) => {
  try {
    await insert()
    return
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error
    }
  }

  const stored = await findStored()
  const isResubmission =
    stored?.orgId === request.orgId &&
    stored.payloadHash === hashPayload(request.payload)

  if (!isResubmission) {
    logger.error(context, conflictMessage)
    throw new AlreadyStoredError(conflictMessage)
  }

  logger.info(context, 'Same request already stored, so not stored again')
}
