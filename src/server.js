import Hapi from '@hapi/hapi'

import { secureContext } from '@defra/hapi-secure-context'
import {
  basicAuth,
  formatErrorToRFC9457Response,
  getEnvVars
} from '@defra/waste-movement-utils'

import { config } from '#/config.js'
import { router } from '#/plugins/router.js'
import { requestLogger } from '#/plugins/request-logger.js'
import { mongoDb } from '#/plugins/mongodb.js'
import { failAction } from '#/common/helpers/fail-action.js'
import { pulse } from '#/plugins/pulse.js'
import { requestTracing } from '#/plugins/request-tracing.js'
import { journeyLogger } from '#/plugins/journey-logger.js'

export async function createServer() {
  const server = Hapi.server({
    host: config.get('host'),
    port: config.get('port'),
    routes: {
      validate: {
        options: {
          abortEarly: false
        },
        failAction
      },
      security: {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: false
        },
        xss: 'enabled',
        noSniff: true,
        xframe: true
      }
    },
    router: {
      stripTrailingSlash: true
    }
  })

  // Hapi Plugins:
  // requestLogger  - automatically logs incoming requests
  // requestTracing - trace header logging and propagation
  // secureContext  - loads CA certificates from environment config
  // pulse          - provides shutdown handlers
  // mongoDb        - sets up mongo connection pool and attaches to `server` and `request` objects
  // basicAuth      - the 'basic' strategy, for callers' ACCESS_CRED_* credentials
  // journeyLogger  - logs each waste movement journey step, before the error is formatted
  // formatErrorToRFC9457Response - every error response as RFC 9457 problem details
  // router         - routes used in the app
  await server.register([
    requestLogger,
    requestTracing,
    secureContext,
    pulse,
    {
      plugin: mongoDb,
      options: config.get('mongo')
    },
    basicAuth(getEnvVars('ACCESS_CRED_')),
    journeyLogger,
    {
      plugin: formatErrorToRFC9457Response,
      options: {
        shouldFormat: () => true,
        typeBase: config.get('problemDetails.typeBase')
      }
    }
  ])

  // Every route needs Basic auth unless it opts out, as /health does
  server.auth.default('basic')

  await server.register(router)

  return server
}
