import { backoffOptions } from '@defra/waste-movement-utils'
import { backOff } from 'exponential-backoff'
import { isDuplicateKeyError } from './duplicate-key.js'

/**
 * Runs an insert into a collection with a unique index, retrying a failed
 * write. A retry that hits a duplicate key is the earlier attempt having
 * succeeded after all (e.g. its acknowledgement was lost), so it counts as
 * success. The first attempt hitting one means the key was already taken,
 * e.g. an ID minted twice, which is thrown and not retried.
 *
 * Only safe for an insert whose unique key is fixed before the first attempt:
 * without the unique index, a retry would store the record twice.
 *
 * @param {object} logger
 * @param {() => Promise<unknown>} insert
 * @param {object} [context] - logged when a retry finds the record stored,
 * e.g. `{ movementId }`
 */
export const insertWithRetry = async (logger, insert, context = {}) => {
  const options = backoffOptions(logger)
  let isRetry = false

  await backOff(
    async () => {
      try {
        await insert()
      } catch (error) {
        if (isRetry && isDuplicateKeyError(error)) {
          logger.info(context, 'Record already stored by an earlier attempt')
          return
        }
        throw error
      } finally {
        isRetry = true
      }
    },
    {
      ...options,
      retry: (error, attemptNumber) =>
        !isDuplicateKeyError(error) && options.retry(error, attemptNumber)
    }
  )
}
