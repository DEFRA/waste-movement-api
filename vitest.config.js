import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    clearMocks: true,
    restoreMocks: true,
    fileParallelism: false,
    // The integration tests have their own config: vitest.integration.config.js
    exclude: [
      ...configDefaults.exclude,
      'src/versions/*/tests/**/*.test.js',
      'test/integration/**'
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.js'],
      exclude: [...configDefaults.exclude, 'coverage']
    },
    globalSetup: ['.vite/mongo-memory-server.js']
  }
})
