import convict from 'convict'
import convictFormatWithValidator from 'convict-format-with-validator'

convict.addFormats(convictFormatWithValidator)

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'

// Also the default database name, and the user this service calls other
// services as
const serviceName = 'waste-movement-api'

export const config = convict({
  serviceVersion: {
    doc: 'The service version, this variable is injected into your docker container in CDP environments',
    format: String,
    nullable: true,
    default: null,
    env: 'SERVICE_VERSION'
  },
  host: {
    doc: 'The IP address to bind',
    format: 'ipaddress',
    default: '0.0.0.0',
    env: 'HOST'
  },
  port: {
    doc: 'The port to bind',
    format: 'port',
    default: 3001,
    env: 'PORT'
  },
  serviceName: {
    doc: 'Api Service Name',
    format: String,
    default: serviceName
  },
  cdpEnvironment: {
    doc: 'The CDP environment the app is running in. With the addition of "local" for local development',
    format: [
      'local',
      'infra-dev',
      'management',
      'dev',
      'test',
      'perf-test',
      'ext-test',
      'prod'
    ],
    default: 'local',
    env: 'ENVIRONMENT'
  },
  log: {
    isEnabled: {
      doc: 'Is logging enabled',
      format: Boolean,
      default: !isTest,
      env: 'LOG_ENABLED'
    },
    level: {
      doc: 'Logging level',
      format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
      env: 'LOG_LEVEL'
    },
    format: {
      doc: 'Format to output logs in',
      format: ['ecs', 'pino-pretty'],
      default: isProduction ? 'ecs' : 'pino-pretty',
      env: 'LOG_FORMAT'
    },
    redact: {
      doc: 'Log paths to redact',
      format: Array,
      default: isProduction
        ? ['req.headers.authorization', 'req.headers.cookie', 'res.headers']
        : ['req', 'res', 'responseTime']
    }
  },
  mongo: {
    mongoUrl: {
      doc: 'URI for mongodb',
      format: String,
      default: 'mongodb://127.0.0.1:27017/',
      env: 'MONGO_URI'
    },
    databaseName: {
      doc: 'database for mongodb',
      format: String,
      default: serviceName,
      env: 'MONGO_DATABASE'
    },
    mongoOptions: {
      retryWrites: {
        doc: 'Enable Mongo write retries, overrides mongo URI when set.',
        format: Boolean,
        default: null,
        nullable: true,
        env: 'MONGO_RETRY_WRITES'
      },
      readPreference: {
        doc: 'Mongo read preference, overrides mongo URI when set.',
        format: [
          'primary',
          'primaryPreferred',
          'secondary',
          'secondaryPreferred',
          'nearest'
        ],
        default: null,
        nullable: true,
        env: 'MONGO_READ_PREFERENCE'
      }
    }
  },
  httpProxy: {
    doc: 'HTTP Proxy URL',
    format: String,
    nullable: true,
    default: null,
    env: 'HTTP_PROXY'
  },
  tracing: {
    header: {
      doc: 'CDP tracing header name',
      format: String,
      default: 'x-cdp-request-id',
      env: 'TRACING_HEADER'
    }
  },
  problemDetails: {
    typeBase: {
      doc: 'Base URI used to build RFC 9457 problem type URIs, pointing at the API problem documentation',
      format: String,
      default:
        'https://defra.github.io/digital-waste-tracking-api-site/preview/problems/',
      env: 'PROBLEM_DETAILS_TYPE_BASE'
    }
  },
  wasteTrackingUrl: {
    doc: 'Base URL of waste-tracking-id-backend, which mints movement and delivery IDs. Defaults to the one in the same CDP environment',
    format: String,
    nullable: true,
    default: null,
    env: 'WASTE_TRACKING_URL'
  },
  serviceAuth: {
    username: {
      doc: 'Username this service uses to authenticate with internal backend services',
      format: String,
      default: serviceName,
      env: 'SERVICE_AUTH_USERNAME_WASTE_MOVEMENT_API'
    },
    password: {
      doc: 'Password this service uses to authenticate with internal backend services',
      format: String,
      sensitive: true,
      default: '',
      env: 'SERVICE_AUTH_PASSWORD_WASTE_MOVEMENT_API'
    }
  }
})

if (config.get('wasteTrackingUrl') === null) {
  config.set(
    'wasteTrackingUrl',
    `https://waste-tracking-id-backend.${config.get('cdpEnvironment')}.cdp-int.defra.cloud`
  )
}

config.validate({ allowed: 'strict' })
