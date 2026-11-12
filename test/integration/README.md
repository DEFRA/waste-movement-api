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

| Concern                                              | Real or stubbed                                                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Inbound HTTP                                         | **Real** — native `fetch()` to `127.0.0.1:<ephemeral>`                                                                       |
| Server assembly                                      | **Real** — actual `createServer()` from `src/server.js`, plus `server.start()`                                               |
| Auth, JSON Schema validation, RFC 9457 error formats | **Real**                                                                                                                     |
| MongoDB                                              | **Real** — in-memory replica set; transactions work                                                                          |
| `waste-tracking-id-backend` `GET /next`              | **Stubbed** — a real local Hapi server on an ephemeral port, injected per-suite via `startTestService({ wasteTrackingUrl })` |

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

- **`setup-env.js`** sets `WASTE_TRACKING_URL` to an unreachable default (`http://127.0.0.1:1`), so
  a suite that never starts the stub can't call a real service; `config` is read after it runs.
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

Style: one explicit named `it()` per case, split by failure isolation rather than by route.

- **`src/versions/<version>/tests/*.test.js`** — endpoint-specific cases for that version, plus the shared
  cross-cutting suite from `helpers/beta-endpoint-tests.js` (RFC 9457 formatting, content
  negotiation, request tracing, standard headers, missing required fields).
- **`health.test.js`** — `GET /health`, the only `auth: false` route.
- **`errors.test.js`** — 401 (no or unrecognised credentials), 400 with `errors[]`, 400 for
  malformed JSON and 404 for an unknown path: all RFC 9457 problem responses, as every error from
  this service is.
- **`dependency-failures.test.js`** — `GET /next` failing (500, then unreachable) surfaces as a
  502 Bad Gateway and stores nothing. Each case pays for the client's retries.
- **`route-coverage.test.js`** — `server.table()` must equal the list in `expected-routes.js`, so a
  new route fails until someone consciously adds it there.

## Adding a version

1. The version's `tests/` folder comes with the copy of its folder (see the repo README); change
   `version` and the paths in it.
2. Add the version's routes to `expected-routes.js`.
