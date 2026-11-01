/**
 * E2E: routing — auth-gated routes, deep links, tab switching, and the not-found screen.
 */
import { loadRuntime, type Runtime } from './helpers/runtime';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

const signInVisible = () => expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy();

describe('auth gating', () => {
  it('sends signed-out deep links to sign-in', async () => {
    await rt.renderApp('/settings');
    await rt.until(signInVisible);
  });

  it('keeps signed-in users out of the sign-in screen', async () => {
    rt.seedSession();
    await rt.renderApp('/sign-in');

    await rt.until(() => expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy());
    expect(rt.screen.queryByText('Sign in to Floatplane')).toBeNull();
  });
});

describe('tabs', () => {
  it('switches between Videos and Settings from the tab bar', async () => {
    rt.seedSession();
    const app = await rt.renderApp();
    await rt.until(() => expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy());

    await rt.selectTab('settings');
    await rt.until(() => expect(app.getPathname()).toBe('/settings'));
    expect(rt.selectedTab()).toBe('settings');

    await rt.selectTab('index');
    await rt.until(() => expect(app.getPathname()).toBe('/'));
    expect(rt.selectedTab()).toBe('index');
  });

  it('switches to the History tab and back from the tab bar', async () => {
    rt.seedSession();
    const app = await rt.renderApp();
    await rt.until(() => expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy());

    await rt.selectTab('history');
    await rt.until(() => expect(app.getPathname()).toBe('/history'));
    expect(rt.selectedTab()).toBe('history');
    expect(rt.inTab('history').getByText('Watch History')).toBeTruthy();

    await rt.selectTab('index');
    await rt.until(() => expect(app.getPathname()).toBe('/'));
    expect(rt.selectedTab()).toBe('index');
  });
});

describe('not found', () => {
  it('shows a not-found screen with a way home', async () => {
    rt.seedSession();
    await rt.renderApp('/no/such/page');

    await rt.until(() => expect(rt.screen.getByText('This screen does not exist.')).toBeTruthy());
    await rt.fireEvent.press(rt.screen.getByText('Go to home screen'));

    await rt.until(() => expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy());
  });
});
