/* global __dirname */
/**
 * Settings shared by the unit (jest.config.unit.js) and E2E (jest.config.e2e.js) suites.
 */
const expoPreset = require('jest-expo/jest-preset');

module.exports = {
  preset: 'jest-expo',
  rootDir: __dirname,
  // jest-expo only transforms an allow-list of node_modules packages. @sinkplane/shared ships
  // untranspiled ESM + JSX, so add it to that list (prepended to the preset's own pattern).
  transformIgnorePatterns: expoPreset.transformIgnorePatterns.map(pattern =>
    pattern.startsWith('/node_modules/(?!(') ? pattern.replace('/node_modules/(?!(', '/node_modules/(?!(@sinkplane|') : pattern,
  ),
  moduleNameMapper: {
    // jest-expo maps tsconfig `paths` in declaration order, so `@/*` would shadow `@/assets/*`.
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    // In-memory secure store so the shared SessionProvider / ThemeProvider can persist state.
    '^expo-secure-store$': '<rootDir>/jest/mocks/expo-secure-store.ts',
    // Fake video players (drivable event emitter + VideoView host View) and an orientation lock
    // recorder — both modules require native code that Jest cannot load.
    '^expo-video$': '<rootDir>/jest/mocks/expo-video.tsx',
    '^expo-screen-orientation$': '<rootDir>/jest/mocks/expo-screen-orientation.ts',
  },
  // With `npm run link:shared`, @sinkplane/shared resolves (by realpath) into the sibling clone,
  // whose own node_modules is not this app's. Fall back to this app's node_modules so bare
  // imports from the shared dist share one instance of react, react-query, …
  modulePaths: ['<rootDir>/node_modules'],
  clearMocks: true,
  testTimeout: 30000,
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],
  // GitHub Actions annotations for failing tests in CI (built into Jest 30).
  reporters: process.env.CI ? ['default', 'github-actions'] : ['default'],
};
