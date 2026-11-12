import { pino } from 'pino'

import { loggerOptions } from '#/plugins/logger-options.js'

const logger = pino(loggerOptions)

export function createLogger(seed = {}) {
  return Object.keys(seed).length > 0 ? logger.child(seed) : logger
}
