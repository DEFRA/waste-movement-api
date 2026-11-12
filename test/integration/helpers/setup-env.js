// Runs as a Vitest `setupFiles` entry, i.e. before the test file is imported,
// so before config reads the environment.
//
// Suites that need waste-tracking-id-backend pass the stub's ephemeral URL to
// startTestService(). This default only stops suites that don't start the stub
// from ever calling the real service configured in `src/config.js`.
import { userBasicAuthTest1 } from '#test/data/basic-auth.js'

// Port 1 (tcpmux) is privileged and effectively never listening.
process.env.WASTE_TRACKING_URL = 'http://127.0.0.1:1'

process.env.ACCESS_CRED_TEST1 = userBasicAuthTest1

// A proxy in the dev machine's shell would otherwise swallow the suite's own
// fetch() calls to localhost (Node routes them through it with
// NODE_USE_ENV_PROXY).
delete process.env.HTTP_PROXY
delete process.env.http_proxy
delete process.env.HTTPS_PROXY
delete process.env.https_proxy

process.env.LOG_ENABLED = 'false'
