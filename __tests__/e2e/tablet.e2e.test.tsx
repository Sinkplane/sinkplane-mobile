/**
 * E2E: tablets (iPad Pro / ~12" Android) in portrait and landscape. A large window rotates freely:
 * the app locks DEFAULT everywhere (never PORTRAIT_UP), tab lists become multi-column grids, and
 * landscape player pages show the details beside the video instead of going fullscreen.
 */
import { StyleSheet } from 'react-native';
import { LIVESTREAM_ID, makeVideoPost, techCreator, techMainChannel } from '@test/fixtures';
import {
  PHONE_LANDSCAPE_WINDOW,
  PHONE_WINDOW,
  TABLET_LANDSCAPE_WINDOW,
  TABLET_PORTRAIT_WINDOW,
} from '@test/window-size';

import { loadRuntime, type Runtime } from './helpers/runtime';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

const POST_ID = 'ch-tech-main-01';

/** Boot signed-in at `size` and wait for the Videos tab to show data. */
async function launchAt(size: { width: number; height: number }) {
  rt.setWindow(size);
  rt.seedSession();
  const app = await rt.renderApp();
  await rt.until(() => expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy());
  return app;
}

/** The FlatList props of the videos tab's list. */
const columns = () => rt.listNumColumns('videos-list');

describe('the app-wide orientation policy', () => {
  it('boots a tablet on DEFAULT (free rotation), a phone on portrait-only', async () => {
    await launchAt(TABLET_PORTRAIT_WINDOW);
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(rt.orientation.OrientationLock.DEFAULT);
    expect(rt.orientation.lockAsync).not.toHaveBeenCalledWith(rt.orientation.OrientationLock.PORTRAIT_UP);

    await launchAt(PHONE_WINDOW);
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(rt.orientation.OrientationLock.PORTRAIT_UP);
  });

  it('keeps DEFAULT while navigating tabs, and leaving a video page on a tablet restores DEFAULT', async () => {
    await launchAt(TABLET_LANDSCAPE_WINDOW);
    await rt.selectTab('history');
    await rt.until(() => expect(rt.selectedTab()).toBe('history'));
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(rt.orientation.OrientationLock.DEFAULT);

    await rt.selectTab('index');
    await rt.until(() => expect(rt.selectedTab()).toBe('index'));
    await rt.fireEvent.press(rt.inTab('index').getByTestId(`video-list-item-${POST_ID}`));
    await rt.until(() => expect(rt.screen.getByTestId('video-screen')).toBeTruthy());
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
    await rt.until(() => expect(rt.screen.getByTestId('comment-list')).toBeTruthy());
    await rt.act(async () => rt.mockVideoPlayerState.lastPlayer().setStatus('readyToPlay'));

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Close video' }));
    await rt.until(() => expect(rt.screen.queryByTestId('video-screen')).toBeNull());
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(rt.orientation.OrientationLock.DEFAULT);
  });
});

describe('the tab grids', () => {
  it('shows 3 columns in portrait (1024) and 4 in landscape (1366), opening videos on tap', async () => {
    await launchAt(TABLET_PORTRAIT_WINDOW);
    expect(columns()).toBe(3);

    // Rotating the window keeps the feed's items and bumps the grid to 4 columns.
    await rt.act(async () => rt.setWindow(TABLET_LANDSCAPE_WINDOW));
    await rt.until(() => expect(columns()).toBe(4));
    expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();

    // A grid item still opens the video page.
    await rt.fireEvent.press(rt.inTab('index').getByTestId(`video-list-item-${POST_ID}`));
    await rt.until(() => expect(rt.screen.getByTestId('video-screen')).toBeTruthy());
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
  });

  it('keeps one column on a phone window', async () => {
    await launchAt(PHONE_WINDOW);
    expect(columns()).toBe(1);
  });

  it('keeps one column while a phone is sideways for a fullscreen video', async () => {
    await launchAt(PHONE_WINDOW);
    await rt.fireEvent.press(rt.inTab('index').getByTestId(`video-list-item-${POST_ID}`));
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
    await rt.until(() => expect(rt.screen.getByTestId('comment-list')).toBeTruthy());

    // Turn the phone sideways: the page goes fullscreen…
    await rt.act(async () => {
      rt.orientation.emitOrientationChange(rt.orientation.Orientation.LANDSCAPE_LEFT);
      rt.setWindow(PHONE_LANDSCAPE_WINDOW);
    });
    await rt.until(() => expect(rt.screen.queryByTestId('comment-list')).toBeNull()); // fullscreen

    // …and backing out with the phone still sideways must not turn the feed into a grid: the
    // list's key would change, remounting it and losing the scroll position.
    await rt.act(async () => rt.router.back());
    await rt.until(() => expect(rt.screen.queryByTestId('video-screen')).toBeNull());
    expect(rt.listNumColumns('videos-list')).toBe(1);
    expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();
  });
});

describe('the video page in landscape', () => {
  async function openVideoAt(size: { width: number; height: number }) {
    const app = await launchAt(size);
    await rt.fireEvent.press(rt.inTab('index').getByTestId(`video-list-item-${POST_ID}`));
    await rt.until(() => expect(rt.screen.getByTestId('video-screen')).toBeTruthy());
    // The player mounts once the delivery resolves (it creates the mock player under test).
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
    await rt.until(() => expect(rt.screen.getByTestId('comment-list')).toBeTruthy());
    return app;
  }

  /** The player starts and its controls come up (where the fullscreen button lives). */
  const startPlaying = () =>
    rt.act(async () => {
      rt.mockVideoPlayerState.lastPlayer().setStatus('readyToPlay');
    });

  it('shows the player and the comments side by side; rotating never goes fullscreen', async () => {
    await openVideoAt(TABLET_LANDSCAPE_WINDOW);
    expect(rt.screen.getByTestId('player-column')).toBeTruthy();
    expect(rt.screen.getByTestId('comment-list')).toBeTruthy();
    expect(rt.screen.queryByRole('button', { name: 'Exit fullscreen' })).toBeNull();

    // A rotation is just a layout change on a tablet — no fullscreen, orientation stays DEFAULT.
    await rt.act(async () => rt.orientation.emitOrientationChange(rt.orientation.Orientation.LANDSCAPE_LEFT));
    await rt.advanceTime(100);
    expect(rt.screen.getByTestId('comment-list')).toBeTruthy();
    expect(rt.screen.queryByRole('button', { name: 'Exit fullscreen' })).toBeNull();
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(rt.orientation.OrientationLock.DEFAULT);
    expect(rt.orientation.orientationListenerCount()).toBe(0);

    // Rotating "back" to portrait keeps the page stacked, still not fullscreen.
    await rt.act(async () => rt.setWindow(TABLET_PORTRAIT_WINDOW));
    await rt.advanceTime(100);
    expect(rt.screen.getByTestId('comment-list')).toBeTruthy();
    expect(rt.screen.queryByRole('button', { name: 'Exit fullscreen' })).toBeNull();
  });

  it('Enter fullscreen hides the comments without locking landscape; Exit brings them back', async () => {
    await openVideoAt(TABLET_LANDSCAPE_WINDOW);
    await startPlaying();
    await rt.until(() => expect(rt.screen.getByRole('button', { name: 'Enter fullscreen' })).toBeTruthy());

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Enter fullscreen' }));
    await rt.until(() => expect(rt.screen.queryByTestId('comment-list')).toBeNull());
    expect(rt.screen.getByTestId('player-column')).toBeTruthy();
    // The one orientation lock this page made (or ever makes) is DEFAULT — never LANDSCAPE.
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(rt.orientation.OrientationLock.DEFAULT);
    expect(rt.orientation.lockAsync).not.toHaveBeenCalledWith(rt.orientation.OrientationLock.LANDSCAPE);

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Exit fullscreen' }));
    await rt.until(() => expect(rt.screen.getByTestId('comment-list')).toBeTruthy());
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(rt.orientation.OrientationLock.DEFAULT);
  });

  it('a text-only post stays stacked: full-width comments, no side-by-side split', async () => {
    // Landscape tablet, but a post with neither video nor picture/thumbnail: there is nothing to
    // put in the player column, so the page must not go side by side.
    const video = rt.api.channelVideos(techMainChannel.id)[0];
    const post = makeVideoPost(video, { videoAttachments: false });
    rt.api.posts.set(POST_ID, { ...post, thumbnail: null } as unknown as typeof post);
    await launchAt(TABLET_LANDSCAPE_WINDOW);
    await rt.fireEvent.press(rt.inTab('index').getByTestId(`video-list-item-${POST_ID}`));
    await rt.until(() => expect(rt.screen.getByTestId('video-screen')).toBeTruthy());
    await rt.until(() => expect(rt.screen.getByTestId('video-title')).toBeTruthy());

    expect(rt.screen.queryByTestId('post-image')).toBeNull(); // truly text-only
    // The page style has no flexDirection row, and the details take the full width (no column split).
    expect(StyleSheet.flatten(rt.screen.getByTestId('video-screen').props.style).flexDirection).toBeUndefined();
    expect(StyleSheet.flatten(rt.screen.getByTestId('comment-list').props.style)?.flexGrow).toBeUndefined();
    expect(StyleSheet.flatten(rt.screen.getByTestId('player-column').props.style)?.flexGrow).toBeUndefined();

    // The same landscape window with a picture post IS side by side (player beside the details).
    const picture = { id: 'pic-1', type: 'picture', thumbnail: { path: 'https://cdn.floatplane.test/pic-1.jpg' } };
    rt.api.posts.set(POST_ID, { ...post, thumbnail: video.thumbnail, pictureAttachments: [picture] } as unknown as typeof post);
    await rt.act(async () => rt.router.back());
    await rt.until(() => expect(rt.screen.queryByTestId('video-screen')).toBeNull());
    await rt.fireEvent.press(rt.inTab('index').getByTestId(`video-list-item-${POST_ID}`));
    await rt.until(() => expect(rt.screen.getByTestId('post-image')).toBeTruthy());
    expect(StyleSheet.flatten(rt.screen.getByTestId('video-screen').props.style).flexDirection).toBe('row');
    expect(StyleSheet.flatten(rt.screen.getByTestId('comment-list').props.style)?.flexGrow).toBe(1);
  });
});

describe('the live page in landscape', () => {
  it('shows the stream details beside the player', async () => {
    rt.api.liveNow.add(LIVESTREAM_ID);
    await launchAt(TABLET_LANDSCAPE_WINDOW);
    await rt.selectTab('live');
    await rt.until(() => expect(rt.inTab('live').getByTestId('live-status-live')).toBeTruthy());

    await rt.fireEvent.press(rt.inTab('live').getByTestId(`live-stream-${techCreator.id}`));
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
    await rt.until(() => expect(rt.screen.getByTestId('live-title')).toBeTruthy());
    expect(rt.screen.getByTestId('player-column')).toBeTruthy();
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(rt.orientation.OrientationLock.DEFAULT);
  });
});
