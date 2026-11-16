import { health } from '#/routes/health.js'
import { beta3 } from '#/versions/beta-3/index.js'

export const router = {
  plugin: {
    name: 'router',
    register: async (server, _options) => {
      server.route([health])

      // One line per API version. A new version is a copy of its folder in
      // src/versions/ plus a line here; retiring one is deleting both.
      await server.register(beta3, { routes: { prefix: '/beta-3' } })
    }
  }
}
