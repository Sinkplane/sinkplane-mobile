/**
 * Global setup for the E2E suite (runs before each test file).
 * Per-test module resets and state live in helpers/runtime.ts.
 */

// RNTL registers an afterEach auto-cleanup when first imported. Tests import it lazily (after a
// per-test module reset), which would nest that hook inside a running test — so clean up here.
process.env.RNTL_SKIP_AUTO_CLEANUP = 'true';

afterEach(async () => {
  // Use the *current* registry's instance (before the next test resets modules), and await it so
  // a lingering unmount act-scope cannot swallow the next test's render.
  const rntl = jest.requireActual<typeof import('@testing-library/react-native')>('@testing-library/react-native');
  await rntl.cleanup();
  jest.useRealTimers();
});

// The auth/session code logs a lot; keep failure output readable. React warnings and unexpected
// errors stay visible. Silenced: the app's own tagged error/warning logs (tests trigger those failures on
// purpose and assert the UI instead) and the polyfill notice caused by the fetch mock.
const EXPECTED_LOGS = [/^\[(SignIn|Turnstile|Auth|ApiClient)\]/, /Failed to set polyfill/];
const isExpected = (args: unknown[]) => typeof args[0] === 'string' && EXPECTED_LOGS.some(pattern => pattern.test(args[0] as string));
for (const level of ['error', 'warn'] as const) {
  // eslint-disable-next-line no-console -- keep the real logger for unexpected messages
  const raw = console[level];
  jest.spyOn(console, level).mockImplementation((...args: unknown[]) => {
    if (!isExpected(args)) raw(...args);
  });
}
jest.spyOn(console, 'info').mockImplementation(() => undefined);
jest.spyOn(console, 'log').mockImplementation(() => undefined);
