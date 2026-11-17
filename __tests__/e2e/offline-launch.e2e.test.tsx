/**
 * E2E: launching without a network — a stored session is kept and the Videos tab shows the
 * downloaded videos with an offline banner (Try again / pull-to-refresh bring the feed back); a
 * rejected session (401) still signs out; a 5xx keeps it; signed out, sign-in has no downloads link.
 */
import { downloadUri } from '@test/fixtures-downloads';

import { NETWORK_ERROR } from './helpers/mock-api-store';
import { loadRuntime, type Runtime } from './helpers/runtime';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

const rowIds = () =>
  rt.screen
    .queryAllByTestId(/^download-row-/)
    .map((row) => String(row.props['testID']).replace('download-row-', ''));

async function playDownload(postId: string): Promise<void> {
  await rt.fireEvent.press(rt.screen.getByTestId(`download-row-${postId}`));
  await rt.until(() => {
    expect(rt.screen.getByTestId('video-screen')).toBeTruthy();
    expect(rt.screen.getByTestId('video-player')).toBeTruthy();
  });
}

describe('offline launch', () => {
  const offlineBanner = () => rt.screen.getByTestId('offline-banner');

  /** Signed in with downloads (unless `downloads` is false), and the API unreachable. */
  async function launchOffline({ downloads = true } = {}): Promise<void> {
    rt.notifications.mockNotifications.promptAnswer = 'denied';
    if (downloads) {
      rt.seedDownloads();
    }
    rt.seedSession();
    rt.api.offline = true;
    await rt.renderApp();
    await rt.until(() => {
      expect(offlineBanner()).toBeTruthy();
    });
  }

  it('keeps the session and lands on the Videos tab with the downloads, not sign-in', async () => {
    await launchOffline();

    expect(rt.selectedTab()).toBe('index');
    expect(rt.screen.queryByText('Sign in to Floatplane')).toBeNull();
    expect(offlineBanner()).toHaveTextContent(
      "You're offlineHere are the videos you've downloaded. To see all videos, check your connection or mobile data settings.Try again",
      { exact: true },
    );
    expect(rt.screen.getByTestId('offline-retry')).toHaveTextContent('Try again');
    expect(rowIds()).toEqual(['post-2', 'post-1']);
    expect(rt.screen.queryByTestId('offline-downloads-empty')).toBeNull();
    // The stored session survives the failed check.
    expect(rt.secureStore.get('fptoken')).toBeTruthy();
    expect(rt.secureStore.get('fpuser')).toBeTruthy();
  });

  it('a row plays the download from the device, and closing returns to the offline list', async () => {
    await launchOffline();
    await playDownload('post-2');
    expect(rt.mockVideoPlayerState.lastPlayer().source).toMatchObject({
      uri: downloadUri('post-2'),
    });
    expect(rt.api.deliveryRequests('onDemand')).toEqual([]);
    // No saved post: the page shows the download's own details.
    expect(rt.screen.getByTestId('downloaded-video-details')).toBeTruthy();

    await rt.fireEvent.press(rt.screen.getByLabelText('Close video'));
    await rt.until(() => {
      expect(offlineBanner()).toBeTruthy();
    });
    expect(rowIds()).toEqual(['post-2', 'post-1']);
  });

  it('without downloads it says so', async () => {
    await launchOffline({ downloads: false });
    expect(rt.screen.getByTestId('offline-downloads-empty')).toHaveTextContent(
      "You haven't downloaded any videos yet.",
    );
    expect(rowIds()).toEqual([]);
  });

  it('the settings link opens the system settings', async () => {
    const openSettings = jest.spyOn(rt.linking, 'openSettings').mockResolvedValue(undefined);
    await launchOffline();
    await rt.fireEvent.press(rt.screen.getByTestId('offline-open-settings'));
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('Try again while still offline keeps the offline list', async () => {
    await launchOffline();
    const before = rt.api.requestsTo('/api/v3/user/subscriptions').length;
    await rt.fireEvent.press(rt.screen.getByTestId('offline-retry'));
    await rt.until(() => {
      expect(rt.api.requestsTo('/api/v3/user/subscriptions').length).toBeGreaterThan(before);
      expect(rt.screen.getByTestId('offline-retry')).toHaveTextContent('Try again');
    });
    expect(offlineBanner()).toBeTruthy();
    expect(rt.secureStore.get('fptoken')).toBeTruthy();
  });

  it('Try again once back online replaces it with the normal feed', async () => {
    await launchOffline();
    rt.api.offline = false;
    await rt.fireEvent.press(rt.screen.getByTestId('offline-retry'));
    await rt.until(() => {
      expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();
    });
    expect(rt.screen.queryByTestId('offline-banner')).toBeNull();
    expect(rt.screen.queryByText('Sign in to Floatplane')).toBeNull();
  });

  it('pull-to-refresh retries too', async () => {
    await launchOffline();
    rt.api.offline = false;
    const control = rt.screen.getByTestId('offline-downloads').props['refreshControl'] as {
      props: { onRefresh: () => void };
    };
    const { onRefresh } = control.props;
    await rt.act(() => {
      onRefresh();
    });
    await rt.until(() => {
      expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();
    });
  });

  it('relaunching online afterwards is still signed in', async () => {
    await launchOffline();
    // A fresh app process (new module registry) on the same device storage.
    const stored = [...rt.secureStore.entries()];
    await rt.screen.unmount();
    rt = loadRuntime();
    rt.seedDownloads();
    for (const [key, value] of stored) {
      rt.secureStore.set(key, value);
    }
    // The server still knows the session.
    rt.api.sessions.add(String(JSON.parse(rt.secureStore.get('fptoken') ?? '""')));
    await rt.renderApp();
    await rt.until(() => {
      expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();
    });
    expect(rt.screen.queryByText('Sign in to Floatplane')).toBeNull();
  });

  it('a session the API rejects (401) still goes to sign-in and is forgotten', async () => {
    rt.seedDownloads();
    rt.seedSession();
    rt.api.failRequests('GET /api/v3/user/subscriptions', {
      status: 401,
      body: { message: 'Unauthorized' },
    });
    await rt.renderApp();
    await rt.until(() => {
      expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy();
    });
    expect(rt.screen.queryByTestId('offline-banner')).toBeNull();
    expect(rt.secureStore.get('fptoken')).toBeUndefined();
  });

  it('signed out and offline: sign-in has no downloads link, even with downloads on disk', async () => {
    rt.seedDownloads();
    rt.api.offline = true;
    await rt.renderApp();
    await rt.until(() => {
      expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy();
    });
    expect(rt.screen.queryByTestId('sign-in-downloads')).toBeNull();
    expect(rt.screen.queryByRole('link', { name: /Watch downloaded videos/ })).toBeNull();
  });

  it('a server error (500) at launch keeps the session and shows the offline view', async () => {
    rt.notifications.mockNotifications.promptAnswer = 'denied';
    rt.seedDownloads();
    rt.seedSession();
    rt.api.failRequests('GET /api/v3/user/subscriptions', {
      status: 500,
      body: { message: 'Oops' },
    });
    await rt.renderApp();
    await rt.until(() => {
      expect(offlineBanner()).toBeTruthy();
    });
    expect(rt.screen.queryByText('Sign in to Floatplane')).toBeNull();
    expect(rt.secureStore.get('fptoken')).toBeTruthy();
    expect(rowIds()).toEqual(['post-2', 'post-1']);
  });

  it('a network drop mid-launch (Expo FetchError, not a TypeError) keeps the session', async () => {
    rt.notifications.mockNotifications.promptAnswer = 'denied';
    rt.seedSession();
    rt.api.failRequests('GET /api/v3/user/subscriptions', NETWORK_ERROR);
    await rt.renderApp();
    await rt.until(() => {
      expect(offlineBanner()).toBeTruthy();
    });
    expect(rt.secureStore.get('fptoken')).toBeTruthy();
  });

  it('a Cloudflare challenge (403, cf-mitigated) at launch keeps the session, offline', async () => {
    rt.notifications.mockNotifications.promptAnswer = 'denied';
    rt.seedDownloads();
    rt.seedSession();
    rt.api.failRequests('GET /api/v3/user/subscriptions', {
      status: 403,
      body: 'Just a moment...',
      headers: { 'cf-mitigated': 'challenge' },
    });
    await rt.renderApp();
    await rt.until(() => {
      expect(offlineBanner()).toBeTruthy();
    });
    expect(rt.screen.queryByText('Sign in to Floatplane')).toBeNull();
    expect(rt.secureStore.get('fptoken')).toBeTruthy();
  });

  it('a plain 403 still signs out', async () => {
    rt.seedSession();
    rt.api.failRequests('GET /api/v3/user/subscriptions', {
      status: 403,
      body: { message: 'Forbidden' },
    });
    await rt.renderApp();
    await rt.until(() => {
      expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy();
    });
    expect(rt.screen.queryByTestId('offline-banner')).toBeNull();
    expect(rt.secureStore.get('fptoken')).toBeUndefined();
  });

  it('signed out without downloads the sign-in screen has no downloads link', async () => {
    rt.api.offline = true;
    await rt.renderApp();
    await rt.until(() => {
      expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy();
    });
    expect(rt.screen.queryByTestId('sign-in-downloads')).toBeNull();
  });
});

describe('a retry still in flight', () => {
  it("that fails after the user signed out and in again doesn't sign out the new session", async () => {
    rt.notifications.mockNotifications.promptAnswer = 'denied';
    rt.seedDownloads();
    const staleToken = rt.seedSession();
    rt.api.offline = true;
    await rt.renderApp();
    await rt.until(() => {
      expect(rt.screen.getByTestId('offline-banner')).toBeTruthy();
    });

    // Try again: the subscriptions request hangs, then is rejected (401).
    rt.api.offline = false;
    rt.api.latencyMs = 3000;
    rt.api.failRequests(
      'GET /api/v3/user/subscriptions',
      { status: 401, body: { message: 'Unauthorized' } },
      {
        where: (request) => request.bearer === staleToken,
      },
    );
    rt.pressWithoutWaiting(rt.screen.getByTestId('offline-retry'));
    await rt.advanceTime(100);
    rt.api.latencyMs = 0;

    // Meanwhile: sign out, and sign in again (a new session).
    await rt.selectTab('settings');
    await rt.fireEvent.press(rt.inTab('settings').getByText('Sign Out'));
    await rt.until(() => {
      expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy();
    });
    await rt.until(() => {
      expect(rt.turnstile.mounted()).toBe(true);
    });
    await rt.turnstile.solve();
    await rt.fireEvent.changeText(rt.screen.getByPlaceholderText('Username or email'), 'testuser');
    await rt.fireEvent.changeText(rt.screen.getByPlaceholderText('Password'), 'hunter2');
    await rt.fireEvent.press(rt.screen.getByText('Sign In'));
    await rt.until(() => {
      expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();
    });
    const newToken = rt.secureStore.get('fptoken');
    expect(newToken).toBeTruthy();

    // The old retry's failure arrives now: ignored.
    await rt.advanceTime(5000);
    expect(rt.secureStore.get('fptoken')).toBe(newToken);
    expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();
    expect(rt.screen.queryByText('Sign in to Floatplane')).toBeNull();
    expect(rt.screen.queryByTestId('offline-banner')).toBeNull();
  });
});
