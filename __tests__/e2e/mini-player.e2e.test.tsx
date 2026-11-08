/**
 * E2E: the mini player — the video page's close arrow returns to the list while playback continues
 * in a floating tile (YouTube-style); tapping the tile reopens the page on the same player, ✕ stops
 * it, and opening other media or leaving the page any other way doesn't leave it playing.
 */
import type { GestureResponderEvent } from 'react-native';
import { LIVESTREAM_ID, techCreator } from '@test/fixtures';

import { loadRuntime, type Runtime } from './helpers/runtime';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

const POST_ID = 'ch-tech-main-01';
const OTHER_ID = 'ch-tech-main-02';

const player = () => rt.mockVideoPlayerState.lastPlayer();
/** The player a `VideoView` (by testID) currently shows. */
const shownIn = (testID: 'video-view' | 'mini-player-video') => rt.mockVideoPlayerState.viewsByTestID.get(testID)?.player;

async function openVideo(id = POST_ID) {
  await rt.until(() => expect(rt.inTab('index').getByTestId(`video-list-item-${id}`)).toBeTruthy());
  await rt.fireEvent.press(rt.inTab('index').getByTestId(`video-list-item-${id}`));
  await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
}

/** Sign in, open the first video and let it start playing. */
async function playVideo() {
  rt.seedSession();
  await rt.renderApp();
  await openVideo();
  await rt.act(async () => player().setStatus('readyToPlay'));
  expect(player().playing).toBe(true);
}

async function minimize() {
  await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Close video' }));
  await rt.until(() => expect(rt.screen.getByTestId('mini-player')).toBeTruthy());
}

/** A single-touch responder event at (x, y): the `touchHistory` PanResponder computes gestures from. */
function touch(x: number, y: number, timestamp: number, start = { x: 300, y: 100, timestamp: 0 }) {
  const touchHistory = {
    numberActiveTouches: 1,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: timestamp,
    touchBank: [
      {
        touchActive: true,
        startPageX: start.x,
        startPageY: start.y,
        startTimeStamp: start.timestamp,
        currentPageX: x,
        currentPageY: y,
        currentTimeStamp: timestamp,
        previousPageX: start.x,
        previousPageY: start.y,
        previousTimeStamp: start.timestamp,
      },
    ],
  };
  return {
    nativeEvent: { touches: [{}], changedTouches: [{}], pageX: x, pageY: y, timestamp },
    touchHistory,
  } as unknown as GestureResponderEvent;
}

describe('the close arrow', () => {
  it('goes back to the list and keeps the same player going in the top-right mini player', async () => {
    await playVideo();
    const playing = player();

    await minimize();
    expect(rt.screen.queryByTestId('video-screen')).toBeNull();
    expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();
    expect(rt.screen.getByLabelText('Mini player, corner top-right')).toBeTruthy();
    expect(shownIn('mini-player-video')).toBe(playing);
    expect(rt.mockVideoPlayerState.players).toHaveLength(1);
    expect(playing.playing).toBe(true);
    expect(playing.release).not.toHaveBeenCalled();
  });

  it('keeps the mini player across tabs', async () => {
    await playVideo();
    await minimize();
    await rt.selectTab('history');
    expect(rt.screen.getByTestId('mini-player')).toBeTruthy();
  });

  it('keeps saving watch progress while minimized', async () => {
    await playVideo();
    await minimize();

    player().currentTime = 95;
    await rt.act(async () => {
      player().emit('timeUpdate', { currentTime: 95, bufferedPosition: 95, currentLiveTimestamp: null, currentOffsetFromLive: null });
    });
    await rt.until(() => expect(rt.api.progress.get(POST_ID)).toBe(95));
  });
});

describe('the mini player', () => {
  it('reopens the video page on the same player when tapped, without restarting it', async () => {
    await playVideo();
    const playing = player();
    playing.currentTime = 120;
    await minimize();
    const seeks = playing.seeks.length;

    await rt.fireEvent.press(rt.screen.getByLabelText('Open Main Channel Video 01'));
    await rt.until(() => expect(rt.screen.getByTestId('video-screen')).toBeTruthy());
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();
    expect(rt.mockVideoPlayerState.players).toHaveLength(1);
    expect(shownIn('video-view')).toBe(playing);
    expect(playing.seeks).toHaveLength(seeks);

    // Minimizing again hands the same player back to the tile.
    await minimize();
    expect(shownIn('mini-player-video')).toBe(playing);
  });

  it('pauses / resumes, and ✕ stops playback', async () => {
    await playVideo();
    await minimize();

    await rt.fireEvent.press(rt.screen.getByLabelText('Pause'));
    expect(player().playing).toBe(false);
    await rt.fireEvent.press(rt.screen.getByLabelText('Play'));
    expect(player().playing).toBe(true);

    await rt.fireEvent.press(rt.screen.getByLabelText('Close mini player'));
    await rt.until(() => expect(rt.screen.queryByTestId('mini-player')).toBeNull());
    expect(player().playing).toBe(false);
    expect(player().release).toHaveBeenCalled();
  });

  it('is replaced when another video opens', async () => {
    await playVideo();
    const first = player();
    await minimize();

    await openVideo(OTHER_ID);
    expect(first.release).toHaveBeenCalled();
    expect(player()).not.toBe(first);
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();

    // Leaving the new video normally doesn't bring the old one back.
    await rt.act(async () => rt.router.back());
    await rt.until(() => expect(rt.screen.queryByTestId('video-screen')).toBeNull());
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();
  });

  it('drags to another corner and snaps there, and keeps the corner across tabs', async () => {
    await playVideo();
    await minimize();
    const tile = rt.screen.getByTestId('mini-player');

    // A tiny movement is still a tap, not a drag; a real move captures the responder.
    expect(tile.props.onMoveShouldSetResponderCapture(touch(302, 102, 10))).toBe(false);
    expect(tile.props.onMoveShouldSetResponderCapture(touch(200, 500, 20))).toBe(true);

    // Drag towards the bottom-left: the tile follows the finger and springs into that corner.
    await rt.act(async () => {
      tile.props.onResponderGrant(touch(300, 100, 0));
      tile.props.onResponderMove(touch(60, 700, 400));
      tile.props.onResponderRelease(touch(60, 700, 400));
    });
    await rt.advanceTime(2000);
    await rt.until(() => expect(rt.screen.getByLabelText('Mini player, corner bottom-left')).toBeTruthy());

    // The chosen corner survives leaving the tab (it is the tile's parked position).
    await rt.selectTab('history');
    expect(rt.screen.getByLabelText('Mini player, corner bottom-left')).toBeTruthy();

    // Flung up and to the right, it snaps back to the top-right corner it started in.
    const dragged = rt.screen.getByTestId('mini-player');
    await rt.act(async () => {
      dragged.props.onResponderGrant(touch(60, 700, 1000, { x: 60, y: 700, timestamp: 1000 }));
      dragged.props.onResponderMove(touch(600, 60, 1400, { x: 60, y: 700, timestamp: 1000 }));
      dragged.props.onResponderRelease(touch(600, 60, 1400, { x: 60, y: 700, timestamp: 1000 }));
    });
    await rt.advanceTime(2000);
    await rt.until(() => expect(rt.screen.getByLabelText('Mini player, corner top-right')).toBeTruthy());
  });

  it('highlights its buttons while they are pressed (full press interaction)', async () => {
    await playVideo();
    await minimize();

    const user = rt.userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(rt.screen.getByLabelText('Pause'));
    expect(player().playing).toBe(false);
  });
});

describe('leaving the page another way', () => {
  it('a back gesture / Android back stops playback instead of minimizing', async () => {
    await playVideo();
    const playing = player();

    await rt.act(async () => rt.router.back());
    await rt.until(() => expect(rt.screen.queryByTestId('video-screen')).toBeNull());
    await rt.advanceTime(10);
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();
    expect(playing.release).toHaveBeenCalled();
  });
});

describe('signing out', () => {
  it('Settings sign-out while the mini player is up stops playback and drops the tile', async () => {
    await playVideo();
    const playing = player();
    await minimize();

    await rt.selectTab('settings');
    await rt.fireEvent.press(rt.inTab('settings').getByText('Sign Out'));

    await rt.until(() => expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy());
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();
    expect(playing.playing).toBe(false);
    expect(playing.release).toHaveBeenCalled();
    expect(rt.api.revokedSessions).toHaveLength(1);
  });
});

describe('live streams', () => {
  it('minimize into the mini player and reopen the live page on the same player', async () => {
    rt.api.liveNow.add(LIVESTREAM_ID);
    rt.seedSession();
    await rt.renderApp();
    await rt.selectTab('live');
    await rt.until(() => expect(rt.inTab('live').getByTestId('live-status-live')).toBeTruthy());
    await rt.fireEvent.press(rt.inTab('live').getByTestId(`live-stream-${techCreator.id}`));
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
    await rt.act(async () => player().setStatus('readyToPlay'));
    const live = player();

    await minimize();
    expect(rt.screen.queryByTestId('live-screen')).toBeNull();

    await rt.fireEvent.press(rt.screen.getByTestId('mini-player-expand'));
    await rt.until(() => expect(rt.screen.getByTestId('live-screen')).toBeTruthy());
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
    expect(shownIn('video-view')).toBe(live);
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();
  });

  it('a reload attempt gets a fresh player, and so does reopening the tile afterwards', async () => {
    rt.api.liveNow.add(LIVESTREAM_ID);
    rt.seedSession();
    await rt.renderApp();
    await rt.selectTab('live');
    await rt.until(() => expect(rt.inTab('live').getByTestId('live-status-live')).toBeTruthy());
    await rt.fireEvent.press(rt.inTab('live').getByTestId(`live-stream-${techCreator.id}`));
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
    await rt.act(async () => player().setStatus('readyToPlay'));
    const first = player();

    // A playback error reloads the stream with a fresh player (fresh signed URL) 5s later.
    await rt.act(async () => {
      first.status = 'error';
      first.emit('statusChange', { status: 'error', error: { message: 'The network connection was lost.' } });
    });
    expect(rt.screen.getByTestId('player-error')).toBeTruthy();
    await rt.advanceTime(5000);
    await rt.until(() => expect(rt.mockVideoPlayerState.players).toHaveLength(2));
    await rt.advanceTime(10);
    const reloaded = player();
    expect(reloaded).not.toBe(first);
    expect(first.release).toHaveBeenCalled();
    await rt.act(async () => reloaded.setStatus('readyToPlay'));

    // The tile carries the reloaded stream…
    await minimize();
    expect(shownIn('mini-player-video')).toBe(reloaded);
    expect(reloaded.playing).toBe(true);

    // …but reopening remounts the live page, whose reload bookkeeping starts over: the page
    // takes a fresh player and releases the reloaded one rather than keeping two streams.
    await rt.fireEvent.press(rt.screen.getByTestId('mini-player-expand'));
    await rt.until(() => expect(rt.screen.getByTestId('live-screen')).toBeTruthy());
    await rt.until(() => expect(rt.mockVideoPlayerState.players).toHaveLength(3));
    expect(reloaded.release).toHaveBeenCalled();
    expect(shownIn('video-view')).not.toBe(reloaded);
    expect(shownIn('video-view')).not.toBe(first);
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();
  });
});
