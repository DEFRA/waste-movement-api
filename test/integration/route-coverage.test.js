import { test } from './helpers/fixtures.js'
import { expectedRoutes } from './expected-routes.js'

function byMethodThenPath(a, b) {
  return a.method === b.method
    ? a.path.localeCompare(b.path)
    : a.method.localeCompare(b.method)
}

describe('route coverage', () => {
  test('registers exactly the declared set of routes', ({ service }) => {
    // Every route, whichever plugin registered it: a new version's routes
    // are registered by its own plugin, under the router's.
    const actualRoutes = service.server
      .table()
      .map(({ method, path }) => ({ method, path }))
      .sort(byMethodThenPath)

    expect(actualRoutes).toEqual([...expectedRoutes].sort(byMethodThenPath))
  })
})
