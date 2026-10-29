/**
 * Unit tests: colocated `src/**\/*.test.ts(x)` files exercising components, hooks and utilities in
 * isolation. Screens under src/app are route modules driven by the E2E suite instead.
 *
 * Coverage is enforced: `npm run test:unit:coverage` (and CI) fails when any metric drops below
 * the thresholds below.
 */
const base = require('./jest.config.base');

module.exports = {
  ...base,
  displayName: 'unit',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.@(ts|tsx)'],
  setupFilesAfterEnv: ['<rootDir>/jest/setup.unit.ts'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    // Route modules — covered by the E2E suite.
    '!src/app/**',
    // Re-export barrel and ambient declarations: no logic of their own.
    '!src/shared.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
  ],
  coverageDirectory: '<rootDir>/coverage/unit',
  coverageThreshold: {
    global: {
      statements: 95,
      branches: 90,
      functions: 95,
      lines: 95,
    },
  },
};
