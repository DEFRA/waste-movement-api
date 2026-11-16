import { randomInt } from 'node:crypto'
import Hapi from '@hapi/hapi'

const host = '127.0.0.1'
const idAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

// A fake ID in the format waste-tracking-id-backend mints: a two-digit year
// followed by six or seven characters from A–Z and 0–9 (e.g. 26HRA0B2,
// 267ZCU888). The beta-2 response schemas check that format, so a looser fake
// would turn every 201 into a 500. Both lengths are generated so the longer
// one is exercised too.
const nextWasteTrackingId = () =>
  String(new Date().getFullYear()).slice(-2) +
  Array.from(
    { length: 6 + randomInt(2) },
    () => idAlphabet[randomInt(idAlphabet.length)]
  ).join('')

// A real Hapi server standing in for waste-tracking-id-backend's GET /next -
// the one external dependency this suite doesn't run against the real service.
//
// Binds an ephemeral port on first start; `baseUrl` is available after that.
// A restart after stop() rebinds the same port, since the service under test
// is already configured with it.
export function createWasteTrackingStub() {
  let forcedStatusCode = null
  let port = 0
  let server

  const createServer = () => {
    const stub = Hapi.server({ host, port })

    stub.route({
      method: 'GET',
      path: '/next',
      handler: (_request, h) => {
        if (forcedStatusCode) {
          return h.response().code(forcedStatusCode)
        }

        return h.response({ wasteTrackingId: nextWasteTrackingId() })
      }
    })

    return stub
  }

  return {
    get baseUrl() {
      if (!port) {
        throw new Error('waste tracking stub has not been started')
      }
      return `http://${host}:${port}`
    },
    start: async () => {
      server = createServer()
      await server.start()
      port = server.info.port
    },
    stop: () => server.stop(),
    // Forces every subsequent GET /next to fail with statusCode, or clears
    // the override when called with no arguments / a falsy statusCode.
    respondWith: ({ statusCode } = {}) => {
      forcedStatusCode = statusCode || null
    }
  }
}
