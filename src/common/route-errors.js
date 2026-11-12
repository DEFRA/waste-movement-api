import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { boomify } from '@hapi/boom'

/**
 * Turns an error a route handler caught into the Boom the RFC 9457 formatter
 * reports. A Boom keeps its status; another error with a `statusCode` (e.g.
 * a ValidationError) gets that status, and anything else is a 500.
 *
 * @param {Error} error
 * @returns {import('@hapi/boom').Boom}
 */
export const handleBetaRouteError = (error) =>
  boomify(error, {
    statusCode: error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR,
    override: false
  })
