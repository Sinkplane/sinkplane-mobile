/**
 * Harness smoke test: boot the real app with a seeded session and see the Videos tab render data
 * from the mock API. If this passes, the other suites can trust the harness.
 */
import { loadRuntime, type Runtime } from './helpers/runtime';

describe('E2E smoke', () => {
  let rt: Runtime;

  beforeEach(() => {
    rt = loadRuntime();
  });

  it('boots signed-in and renders the Videos tab', async () => {
    rt.seedSession();
    await rt.renderApp();

    await rt.until(() => expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy());
    expect(rt.inTab('index').getByText('All Subscriptions')).toBeTruthy();
    expect(rt.selectedTab()).toBe('index');

    await rt.selectTab('settings');
    await rt.until(() => expect(rt.selectedTab()).toBe('settings'));
    expect(rt.inTab('settings').getByText('Test User')).toBeTruthy();
  });

  it('boots signed-out on the sign-in screen', async () => {
    await rt.renderApp();
    await rt.until(() => expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy());
  });
});
