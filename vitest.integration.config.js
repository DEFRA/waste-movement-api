import { defineConfig } from 'vitest/config'

// Real HTTP against the real server, with an in-memory MongoDB replica set and
// a stub waste-tracking-id-backend: see test/integration/README.md.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    clearMocks: true,
    include: [
      // Each version's own suite, beside its code
      'src/versions/*/tests/**/*.test.js',
      'test/integration/**/*.test.js'
    ],
    // The replica set binds a fixed port, so one file at a time
    fileParallelism: false,
    setupFiles: ['test/integration/helpers/setup-env.js'],
    testTimeout: 30000,
    hookTimeout: 60000
  }
})
