/**
 * E2E: the Settings tab — profile + subscriptions, the System/Light/Dark switcher (persisted, and
 * applied to both the React tree and the native appearance), and signing out.
 */
import { StyleSheet } from 'react-native';

import { Colors } from '@/shared';
import { fixtureUser, gamingCreator, techCreator } from '@test/fixtures';

import { NETWORK_ERROR } from './helpers/mock-floatplane-api';
import { loadRuntime, type Runtime } from './helpers/runtime';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

const settingsTab = () => rt.inTab('settings');
const colorOf = (element: { props: { style?: unknown } }) => StyleSheet.flatten(element.props.style as never)?.color;
/** Background of the Videos screen (the view wrapping its list). */
const videosBackground = () => StyleSheet.flatten(rt.screen.getByTestId('videos-list').parent?.props.style)?.backgroundColor;

async function openSettings(options?: Parameters<Runtime['seedSession']>[0]) {
  const token = rt.seedSession(options);
  await rt.renderApp();
  await rt.until(() => expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy());
  await rt.selectTab('settings');
  await rt.until(() => expect(rt.selectedTab()).toBe('settings'));
  return token;
}

describe('profile', () => {
  it('shows the signed-in user and their subscriptions', async () => {
    await openSettings();

    expect(settingsTab().getByText('Test User')).toBeTruthy();
    expect(settingsTab().getByText('@testuser')).toBeTruthy();
    expect(settingsTab().getByText('Tech Channel')).toBeTruthy();
    expect(settingsTab().getByText('Tech Supporter')).toBeTruthy();
    expect(settingsTab().getByText('Gaming Channel')).toBeTruthy();
    expect(settingsTab().getByText('Gaming Supporter')).toBeTruthy();
  });

  it('falls back to an initial avatar and the username when the profile is sparse', async () => {
    const sparseUser = { ...fixtureUser, profileImage: undefined, displayName: undefined } as unknown as typeof fixtureUser;
    await openSettings({ user: sparseUser });

    expect(settingsTab().getByText('T')).toBeTruthy();
    expect(settingsTab().getAllByText('testuser').length).toBeGreaterThan(0);
  });

  it('labels subscriptions whose creator or plan details are missing', async () => {
    // The creator list only returns Tech; the Gaming subscription has no plan title.
    rt.api.creators = [techCreator];
    rt.api.subscriptions = rt.api.subscriptions.map(sub =>
      sub.creator === gamingCreator.id ? { ...sub, plan: undefined as unknown as typeof sub.plan } : sub,
    );
    await openSettings();

    expect(settingsTab().getByText(`Creator ${gamingCreator.id}`)).toBeTruthy();
    expect(settingsTab().getByText('Active')).toBeTruthy();
  });

  it('shows a loading state until the session has loaded', async () => {
    rt.api.latencyMs = 1000;
    rt.seedSession();
    await rt.renderApp();

    await rt.until(() => expect(settingsTab().getByText('Loading your profile...')).toBeTruthy(), { maxFakeMs: 500 });
    await rt.until(() => expect(settingsTab().getByText('Test User')).toBeTruthy(), { maxFakeMs: 10_000 });
  });
});

describe('theme switcher', () => {
  const radio = (label: string) => settingsTab().getByRole('radio', { name: `${label} theme` });

  it('follows the system appearance by default', async () => {
    await openSettings();

    expect(radio('System')).toBeSelected();
    expect(rt.setColorScheme).toHaveBeenLastCalledWith('auto');
    expect(videosBackground()).toBe(Colors.light.background);
  });

  it('switches the whole app to dark mode and the native chrome with it', async () => {
    await openSettings();

    await rt.fireEvent.press(radio('Dark'));

    expect(radio('Dark')).toBeSelected();
    expect(rt.setColorScheme).toHaveBeenLastCalledWith('dark');
    expect(videosBackground()).toBe(Colors.dark.background);
    expect(colorOf(settingsTab().getByText('Appearance'))).toBe(Colors.dark.text);
    await rt.until(() => expect(rt.secureStore.get('themeMode')).toBe(JSON.stringify('dark')));
  });

  it('switches to light mode and back to system', async () => {
    await openSettings();

    await rt.fireEvent.press(radio('Light'));
    expect(rt.setColorScheme).toHaveBeenLastCalledWith('light');
    expect(videosBackground()).toBe(Colors.light.background);

    await rt.fireEvent.press(radio('System'));
    expect(rt.setColorScheme).toHaveBeenLastCalledWith('auto');
    await rt.until(() => expect(rt.secureStore.get('themeMode')).toBe(JSON.stringify('system')));
  });

  it('restores the saved theme on launch', async () => {
    rt.secureStore.set('themeMode', JSON.stringify('dark'));
    await openSettings();

    expect(radio('Dark')).toBeSelected();
    expect(rt.setColorScheme).toHaveBeenLastCalledWith('dark');
    expect(videosBackground()).toBe(Colors.dark.background);
  });

  it('keeps the sign-in screen light-on-dark in either theme', async () => {
    rt.secureStore.set('themeMode', JSON.stringify('light'));
    await rt.renderApp();
    await rt.until(() => expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy());

    expect(colorOf(rt.screen.getByText('Sign in to Floatplane'))).toBe('#fff');
    await rt.until(() => expect(rt.turnstile.mounted()).toBe(true));
    expect(rt.turnstile.html()).toContain('theme: "dark"');
  });
});

describe('sign out', () => {
  it('revokes the session, clears it from storage, and returns to sign-in', async () => {
    const token = await openSettings();

    await rt.fireEvent.press(settingsTab().getByText('Sign Out'));

    await rt.until(() => expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy());
    expect(rt.api.revokedSessions).toEqual([token]);
    expect(rt.api.requestsTo('/api/v3/auth/logout', 'POST')[0].bearer).toBe(token);
    expect(rt.secureStore.has('fptoken')).toBe(false);
    expect(rt.secureStore.has('fpuser')).toBe(false);
  });

  it('shows progress while signing out', async () => {
    await openSettings();
    rt.api.latencyMs = 1000;

    rt.pressWithoutWaiting(settingsTab().getByText('Sign Out'));
    expect(settingsTab().getByText('Signing Out...')).toBeTruthy();
    expect(rt.api.revokedSessions).toHaveLength(0);

    await rt.until(() => expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy());
  });

  it('still signs out locally when the server cannot be reached', async () => {
    await openSettings();
    rt.api.failRequests('POST', '/api/v3/auth/logout', NETWORK_ERROR);

    await rt.fireEvent.press(settingsTab().getByText('Sign Out'));

    await rt.until(() => expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy());
    expect(rt.secureStore.has('fptoken')).toBe(false);
  });
});
