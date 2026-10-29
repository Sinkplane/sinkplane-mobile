/**
 * E2E suite: boots the real Expo Router app (src/app/**) inside Jest via
 * `expo-router/testing-library`, against a stateful in-memory Floatplane API that replaces
 * global.fetch. Native-only modules (the Turnstile WebView, secure store, splash screen) are
 * controllable mocks — see __tests__/e2e/helpers. Everything else — navigation, native tabs,
 * providers, react-query, the shared auth/session/theme code, screens — runs as production code.
 */
const base = require('./jest.config.base');

module.exports = {
  ...base,
  displayName: 'e2e',
  roots: ['<rootDir>/__tests__/e2e'],
  testMatch: ['**/*.e2e.test.@(ts|tsx)'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/e2e/jest.setup.ts'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/shared.ts', '!src/**/*.d.ts', '!src/**/*.test.{ts,tsx}'],
  coverageDirectory: '<rootDir>/coverage/e2e',
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90,
    },
  },
};
