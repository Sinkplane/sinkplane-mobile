/**
 * E2E: the one video page works without Floatplane. A post opened online is saved with its
 * comments, so it reopens offline (reactions off); losing and regaining the connection while on
 * the page toggles the reactions; a post that was never opened falls back to its download.
 */
import { downloadUri, makeDownloadedVideo } from '@test/fixtures-downloads';

import { loadRuntime, type Runtime } from './helpers/runtime';
import { enterCredentials, signInButton } from './helpers/sign-in-flows';
import { firstTechVideo, openVideo, player, POST_ID, untilPlayable } from './helpers/video-page';
import { makeVideoPost } from '@test/fixtures';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
  rt.notifications.mockNotifications.promptAnswer = 'denied';
});

const COMMENT_LIKE = `comment-${POST_ID}-comment-1-like`;
const CACHE_FILE = `file:///document/post-cache/${POST_ID}.json`;

/** The connection is gone: the API rejects like fetch does, and the OS says so. */
async function dropNetwork(): Promise<void> {
  rt.api.offline = true;
  await rt.act(() => {
    rt.network.offline();
  });
}

/** A fresh app process on the same device storage (session, files), with no connection. */
async function relaunchOffline(): Promise<void> {
  const secure = [...rt.secureStore.entries()];
  const files = [...rt.fileSystem.files.entries()];
  await rt.screen.unmount();
  rt = loadRuntime();
  rt.notifications.mockNotifications.promptAnswer = 'denied';
  for (const [key, value] of secure) {
    rt.secureStore.set(key, value);
  }
  for (const [uri, text] of files) {
    rt.fileSystem.files.set(uri, text);
  }
  await dropNetwork();
  await rt.renderApp();
  await rt.until(() => {
    expect(rt.screen.getByTestId('offline-banner')).toBeTruthy();
  });
}

async function untilCommentsLoaded(): Promise<void> {
  await rt.until(() => {
    expect(rt.screen.getByTestId(COMMENT_LIKE)).toBeTruthy();
  });
}

describe('a video opened online, then offline', () => {
  async function openCachedPostOffline(): Promise<void> {
    await openVideo(rt);
    await untilPlayable(rt);
    await untilCommentsLoaded();
    await rt.until(() => {
      const saved = JSON.parse(rt.fileSystem.files.get(CACHE_FILE) ?? '{}') as {
        comments?: unknown[];
      };
      expect(saved.comments?.length).toBeGreaterThan(0);
    });
    await relaunchOffline();
    await rt.act(() => {
      rt.router.push({ pathname: '/video/[id]', params: { id: POST_ID } });
    });
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-title')).toBeTruthy();
    });
  }

  it('shows the saved title, description and comments, with reactions disabled', async () => {
    await openCachedPostOffline();

    expect(rt.screen.getByTestId('video-title')).toHaveTextContent('Main Channel Video 01');
    expect(rt.screen.getByTestId('post-description')).toBeTruthy();
    await untilCommentsLoaded();
    expect(rt.screen.getByTestId('reaction-like')).toBeDisabled();
    expect(rt.screen.getByTestId('reaction-dislike')).toBeDisabled();
    expect(rt.screen.getByTestId(COMMENT_LIKE)).toBeDisabled();
    // No error or spinner for the comments that couldn't be fetched.
    expect(rt.screen.queryByText(/Couldn't load/)).toBeNull();
    expect(rt.api.requestsTo('/api/v3/content/like')).toEqual([]);
  });

  it('hides the Download button for a video that is not downloaded', async () => {
    await openCachedPostOffline();
    expect(rt.screen.queryByTestId('download-button')).toBeNull();
  });
});

describe('the network drops and returns on the page', () => {
  it('disables the reactions while offline and enables them again online', async () => {
    await openVideo(rt);
    await untilPlayable(rt);
    await untilCommentsLoaded();
    expect(rt.screen.getByTestId('reaction-like')).toBeEnabled();
    expect(rt.screen.getByTestId(COMMENT_LIKE)).toBeEnabled();

    await rt.act(() => {
      rt.network.offline();
    });
    expect(rt.screen.getByTestId('reaction-like')).toBeDisabled();
    expect(rt.screen.getByTestId('reaction-dislike')).toBeDisabled();
    expect(rt.screen.getByTestId(COMMENT_LIKE)).toBeDisabled();

    await rt.act(() => {
      rt.network.online();
    });
    expect(rt.screen.getByTestId('reaction-like')).toBeEnabled();
    expect(rt.screen.getByTestId(COMMENT_LIKE)).toBeEnabled();
  });

  it('does not save progress while offline', async () => {
    await openVideo(rt);
    await untilPlayable(rt);
    await rt.act(() => {
      rt.network.offline();
    });
    await rt.act(() => {
      player(rt).setStatus('readyToPlay');
    });
    await rt.act(() => {
      player(rt).emit('timeUpdate', {
        currentTime: 30,
        bufferedPosition: 60,
        currentLiveTimestamp: null,
        currentOffsetFromLive: null,
      });
      player(rt).pause();
    });
    expect(rt.api.requestsTo('/api/v3/content/progress', 'POST')).toEqual([]);
  });
});

describe('a downloaded video offline', () => {
  it('plays the local file with the download details, requesting no stream', async () => {
    rt.seedDownloads([makeDownloadedVideo({ postId: POST_ID, title: 'Saved Title' })]);
    rt.seedSession();
    await dropNetwork();
    await rt.renderApp();
    await rt.until(() => {
      expect(rt.screen.getByTestId('offline-banner')).toBeTruthy();
    });
    await rt.fireEvent.press(rt.screen.getByTestId(`download-row-${POST_ID}`));
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-player')).toBeTruthy();
    });

    expect(player(rt).source).toMatchObject({ uri: downloadUri(POST_ID) });
    expect(rt.api.deliveryRequests('onDemand')).toEqual([]);
    expect(rt.screen.getByTestId('downloaded-video-details')).toHaveTextContent(/Saved Title/);
  });

  it('keeps the Download menu for a post that is already downloaded', async () => {
    rt.seedDownloads([makeDownloadedVideo({ postId: POST_ID })]);
    await openVideo(rt);
    await untilPlayable(rt);
    await rt.act(() => {
      rt.network.offline();
    });
    expect(rt.screen.getByTestId('download-button')).toBeTruthy();
  });
});

describe('a downloaded video started offline', () => {
  it('keeps the same player mounted when the connection comes back', async () => {
    rt.seedDownloads([makeDownloadedVideo({ postId: POST_ID })]);
    rt.seedSession();
    await dropNetwork();
    await rt.renderApp();
    await rt.until(() => {
      expect(rt.screen.getByTestId('offline-banner')).toBeTruthy();
    });
    await rt.fireEvent.press(rt.screen.getByTestId(`download-row-${POST_ID}`));
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-player')).toBeTruthy();
    });
    const playersBefore = rt.mockVideoPlayerState.players.length;
    const first = player(rt);

    // Back online: the session check and the resume lookup run again, but the page stays put.
    rt.api.offline = false;
    await rt.act(() => {
      rt.network.online();
    });
    await rt.until(() => {
      expect(rt.api.requestsTo('/api/v3/content/progress').length).toBeGreaterThan(0);
    });
    expect(rt.screen.getByTestId('video-player')).toBeTruthy();
    expect(rt.mockVideoPlayerState.players).toHaveLength(playersBefore);
    expect(player(rt)).toBe(first);
    expect(first.released).toBe(false);
  });
});

describe('signing out', () => {
  it('clears the saved posts: the next sign-in offline does not see the old account’s post', async () => {
    await openVideo(rt);
    await untilPlayable(rt);
    await rt.until(() => {
      expect(rt.fileSystem.files.has(CACHE_FILE)).toBe(true);
    });
    await rt.act(() => {
      rt.router.back();
    });
    await rt.selectTab('settings');
    await rt.fireEvent.press(rt.inTab('settings').getByText('Sign Out'));
    await rt.until(() => {
      expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy();
    });
    expect(rt.fileSystem.files.has(CACHE_FILE)).toBe(false);

    // Someone signs in on this device, then the connection drops before they open anything.
    await rt.until(() => {
      expect(rt.turnstile.mounted()).toBe(true);
    });
    await rt.turnstile.solve();
    await enterCredentials(rt);
    await rt.fireEvent.press(signInButton(rt));
    await rt.until(() => {
      expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();
    });
    expect(rt.fileSystem.files.has(CACHE_FILE)).toBe(false);

    await relaunchOffline();
    await rt.act(() => {
      rt.router.push({ pathname: '/video/[id]', params: { id: POST_ID } });
    });
    await rt.until(() => {
      expect(rt.screen.getByText("Couldn't load this video.")).toBeTruthy();
    });
    expect(rt.screen.queryByTestId('video-title')).toBeNull();
  });
});

describe('a saved copy while online', () => {
  it('is not used: the page starts from the server’s progress, not the saved one', async () => {
    // Saved last time at 12s; Floatplane now says 90s.
    const stale = makeVideoPost(firstTechVideo(rt), { progress: 12 });
    rt.fileSystem.files.set(
      CACHE_FILE,
      JSON.stringify({ post: stale, comments: [], savedAt: '2026-01-01T00:00:00.000Z' }),
    );
    rt.api.progress.set(POST_ID, 90);
    await openVideo(rt);
    await untilPlayable(rt);

    await rt.act(() => {
      player(rt).setStatus('readyToPlay');
    });
    expect(player(rt).seeks).toContain(90);
    expect(player(rt).seeks).not.toContain(12);
  });
});
