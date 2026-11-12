# Internal HTTP integration tests

A suite that exercises `waste-movement-api` **in isolation over real HTTP** — a real socket, a real
listener, real Hapi lifecycle, real MongoDB with transactions. Nothing in the request/response path
is mocked.

Runs locally (`npm run test:integration`) and in CI, with no Docker and no secrets. Ported from
`waste-movement-backend`'s suite of the same name.

## Why this tier exists

Unit and route tests (`src/**/*.test.js`, `npm test`) use `server.inject()`: faithful to the Hapi
lifecycle, but no socket, no wire-level header parsing, and awkward to reach payload-parse failures.
The cross-repo UAT suite (`digital-waste-tracking-uat`) is real HTTP but needs the whole stack and
its secrets. This tier sits between them: real sockets, single service, seconds not minutes.

## Isolation boundary

| Concern                                              | Real or stubbed                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Inbound HTTP                                         | **Real** — native `fetch()` to `127.0.0.1:<ephemeral>`                                                       |
| Server assembly                                      | **Real** — actual `createServer()` from `src/server.js`, plus `server.start()`                               |
| Auth, JSON Schema validation, RFC 9457 error formats | **Real**                                                                                                     |
| MongoDB                                              | **Real** — in-memory replica set; transactions work                                                          |
| `waste-tracking-id-backend` `GET /next`              | **Stubbed** — a real local Hapi server on an ephemeral port, started per file by the `wasteTracking` fixture |

No `vi.mock` anywhere in the suite. The single external dependency is replaced by a real HTTP server
we control, which doubles as the lever for forcing failures without mocking the service under test.

## Running it

```bash
npm run test:integration
```

This runs Vitest with `vitest.integration.config.js`, which picks up `src/versions/*/tests/**/*.test.js`
(each version's own suite, beside its code) and `test/integration/**/*.test.js`. It sets
`fileParallelism: false`: the in-memory replica set binds a fixed port (`17017`, set by
`@defra/waste-movement-utils`' `createTestMongoDb`), so test files cannot run concurrently.
`vitest.config.js` (the unit suite) excludes both, and they're not in its coverage report.

CI runs it in `.github/workflows/check-pull-request.yml`, straight after `npm test`.

## Layout

```
src/versions/<version>/tests/   endpoint cases for one API version, one or more files
test/integration/
├── helpers/
│   ├── setup-env.js              Vitest `setupFiles` entry — runs before the test file is imported
│   ├── fixtures.js               the Vitest fixtures tests take: service, stub, api/http, failure modes
│   ├── test-service.js           startTestService(): boots real Mongo + real Hapi server on an ephemeral port
│   ├── waste-tracking-stub.js    stand-in for waste-tracking-id-backend's GET /next
│   ├── http.js                   deliberately dumb fetch wrapper (adds Basic auth, no retries/unwrapping)
│   ├── expect-standard-headers.js  shared assertion for security/content-type headers
│   ├── expect-problem-response.js  shared assertion for RFC 9457 error responses
│   ├── expect-response-body-has-shape.js  shared assertion for SUCCESS/ERROR/VALIDATION-ERROR body shapes
│   ├── beta-endpoint-tests.js    shared describeBetaEndpointTests() suite, parameterised by version
│   └── problem-types.js          RFC 9457 `type` URI base
├── expected-routes.js            declared method+path list used by route-coverage.test.js
├── health.test.js
├── errors.test.js
├── dependency-failures.test.js   isolated — forces failures in the stub, mutates shared process state
└── route-coverage.test.js
```

- **`fixtures.js`** — the suite's [Vitest fixtures](https://vitest.dev/guide/test-context.html),
  exported as `test`. A test names the ones it needs, e.g. `test('…', async ({ api }) => …)`, and
  each is set up for it and torn down after, even when the test fails:
  - `wasteTracking` (the stub) and `service` (`startTestService()` pointed at it): one per file.
  - `api(path, options)` — `betaHttpRequest()` against the service; `http(path, options)` —
    `httpRequest()`.
  - `nextFails` (`GET /next` returns 500) and `wasteTrackingDown` (stub stopped): only for the
    test that takes them, so a failing test can't leave the stub broken for the rest.

  A file can add its own with `test.extend()`, as `src/versions/<version>/tests/` does for
  `createMovement` and `movementId`.

- **`setup-env.js`** sets `WASTE_TRACKING_URL` to an unreachable default (`http://127.0.0.1:1`), so
  nothing reaches a real service before a stub's URL is set; `config` is read after it runs.
  It also sets `ACCESS_CRED_TEST1`, deletes any proxy variables (Node would otherwise route the
  suite's own `fetch()` calls to localhost through a proxy set in the shell) and turns logging off.
- **`test-service.js`** — `startTestService({ wasteTrackingUrl })` starts an in-memory replica set
  via `createTestMongoDb` (dependency-injected, so it works outside Jest), points `config` at it,
  binds `127.0.0.1:0`, and — when passed — points the waste-tracking-id-backend client at the stub,
  which reads its URL on every call. Returns `{ baseUrl, server, db, stop() }`.
- **`waste-tracking-stub.js`** — `GET /next` returns a fresh ID in the real format;
  `respondWith({ statusCode })` forces every later call to fail. A `stop()` then `start()` rebinds
  the same port, since the service under test is already configured with it.
- **`http.js`** — `httpRequest()` adds Basic auth and sends what it's given; `betaHttpRequest()`
  also forwards the organisation in `x-dwt-organisation-id`, as the external API does. A string
  `body` is sent as-is, so malformed JSON can be sent on purpose. `x-cdp-request-id` is only sent
  when a `requestId` option is passed; error responses only carry a request ID when one was sent.

## Test files

Style: one explicit named `test()` per case, split by failure isolation rather than by route.
Tests take what they need from `helpers/fixtures.js` rather than setting it up in hooks.

- **`src/versions/<version>/tests/*.test.js`** — endpoint-specific cases for that version, plus the shared
  cross-cutting suite from `helpers/beta-endpoint-tests.js` (RFC 9457 formatting, content
  negotiation, request tracing, standard headers, missing required fields).
- **`health.test.js`** — `GET /health`, the only `auth: false` route.
- **`errors.test.js`** — 401 (no or unrecognised credentials), 400 with `errors[]`, 400 for
  malformed JSON and 404 for an unknown path: all RFC 9457 problem responses, as every error from
  this service is.
- **`dependency-failures.test.js`** — `GET /next` failing (500, then unreachable, through the
  `nextFails` and `wasteTrackingDown` fixtures) surfaces as a 502 Bad Gateway and stores nothing.
  Each case pays for the client's retries.
- **`route-coverage.test.js`** — `server.table()` must equal the list in `expected-routes.js`, so a
  new route fails until someone consciously adds it there.

## Adding a version

1. The version's `tests/` folder comes with the copy of its folder (see the repo README). It takes
   the version name from the version's `index.js`, so needs no changes.
2. Add the version's routes to `expected-routes.js`.
