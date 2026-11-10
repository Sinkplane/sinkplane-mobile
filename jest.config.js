/**
 * Default config for `pnpm exec jest` and editor integrations: runs the unit and E2E suites together.
 * Coverage thresholds are enforced by the per-suite configs — use the make targets
 * (`make coverage`, `make check`) for gated runs.
 */
module.exports = {
  projects: ['<rootDir>/jest.config.unit.js', '<rootDir>/jest.config.e2e.js'],
};
