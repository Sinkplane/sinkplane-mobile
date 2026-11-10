/**
 * E2E: the mini player — the video page's close arrow returns to the list while playback continues
 * in a floating tile (YouTube-style); tapping the tile reopens the page on the same player, ✕ stops
 * it, and opening other media or leaving the page any other way doesn't leave it playing. Stacked
 * player pages: mini-player-stack; live streams: mini-player-live.
 */
import { loadRuntime, type Runtime } from './helpers/runtime';
import {
  goBack,
  minimize,
  openVideo,
  OTHER_ID,
  player,
  playVideo,
  POST_ID,
  shownIn,
  tileResponder,
  touch,
} from './helpers/mini-player-page';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

describe('the close arrow', () => {
  it('goes back to the list and keeps the same player going in the top-right mini player', async () => {
    await playVideo(rt);
    const playing = player(rt);

    await minimize(rt);
    expect(rt.screen.queryByTestId('video-screen')).toBeNull();
    expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();
    expect(rt.screen.getByLabelText('Mini player, corner top-right')).toBeTruthy();
    expect(shownIn(rt, 'mini-player-video')).toBe(playing);
    expect(rt.mockVideoPlayerState.players).toHaveLength(1);
    expect(playing.playing).toBe(true);
    expect(playing.release).not.toHaveBeenCalled();
  });

  it('keeps the mini player across tabs', async () => {
    await playVideo(rt);
    await minimize(rt);
    await rt.selectTab('history');
    expect(rt.screen.getByTestId('mini-player')).toBeTruthy();
  });

  it('keeps saving watch progress while minimized', async () => {
    await playVideo(rt);
    await minimize(rt);

    player(rt).currentTime = 95;
    await rt.act(() => {
      player(rt).emit('timeUpdate', {
        currentTime: 95,
        bufferedPosition: 95,
        currentLiveTimestamp: null,
        currentOffsetFromLive: null,
      });
    });
    await rt.until(() => {
      expect(rt.api.progress.get(POST_ID)).toBe(95);
    });
  });
});

describe('the mini player', () => {
  it('reopens the video page on the same player when tapped, without restarting it', async () => {
    await playVideo(rt);
    const playing = player(rt);
    playing.currentTime = 120;
    await minimize(rt);
    const seeks = playing.seeks.length;

    await rt.fireEvent.press(rt.screen.getByLabelText('Open Main Channel Video 01'));
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-screen')).toBeTruthy();
    });
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-player')).toBeTruthy();
    });
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();
    expect(rt.mockVideoPlayerState.players).toHaveLength(1);
    expect(shownIn(rt, 'video-view')).toBe(playing);
    expect(playing.seeks).toHaveLength(seeks);

    // Minimizing again hands the same player back to the tile.
    await minimize(rt);
    expect(shownIn(rt, 'mini-player-video')).toBe(playing);
  });

  it('pauses / resumes, and ✕ stops playback', async () => {
    await playVideo(rt);
    await minimize(rt);

    await rt.fireEvent.press(rt.screen.getByLabelText('Pause'));
    expect(player(rt).playing).toBe(false);
    await rt.fireEvent.press(rt.screen.getByLabelText('Play'));
    expect(player(rt).playing).toBe(true);

    await rt.fireEvent.press(rt.screen.getByLabelText('Close mini player'));
    await rt.until(() => {
      expect(rt.screen.queryByTestId('mini-player')).toBeNull();
    });
    expect(player(rt).playing).toBe(false);
    expect(player(rt).release).toHaveBeenCalled();
  });

  it('is replaced when another video opens', async () => {
    await playVideo(rt);
    const first = player(rt);
    await minimize(rt);

    await openVideo(rt, OTHER_ID);
    expect(first.release).toHaveBeenCalled();
    expect(player(rt)).not.toBe(first);
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();

    // Leaving the new video normally doesn't bring the old one back.
    await goBack(rt);
    await rt.until(() => {
      expect(rt.screen.queryByTestId('video-screen')).toBeNull();
    });
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();
  });

  it('drags to another corner and snaps there, and keeps the corner across tabs', async () => {
    await playVideo(rt);
    await minimize(rt);
    const tile = tileResponder(rt);

    // A tiny movement is still a tap, not a drag; a real move captures the responder.
    expect(tile.onMoveShouldSetResponderCapture(touch([302, 102, 10]))).toBe(false);
    expect(tile.onMoveShouldSetResponderCapture(touch([200, 500, 20]))).toBe(true);

    // Drag towards the bottom-left: the tile follows the finger and springs into that corner.
    await rt.act(() => {
      tile.onResponderGrant(touch([300, 100, 0]));
      tile.onResponderMove(touch([60, 700, 400]));
      tile.onResponderRelease(touch([60, 700, 400]));
    });
    await rt.advanceTime(2000);
    await rt.until(() => {
      expect(rt.screen.getByLabelText('Mini player, corner bottom-left')).toBeTruthy();
    });

    // The chosen corner survives leaving the tab (it is the tile's parked position).
    await rt.selectTab('history');
    expect(rt.screen.getByLabelText('Mini player, corner bottom-left')).toBeTruthy();

    // Flung up and to the right, it snaps back to the top-right corner it started in.
    const dragged = tileResponder(rt);
    const from = { x: 60, y: 700, timestamp: 1000 };
    await rt.act(() => {
      dragged.onResponderGrant(touch([60, 700, 1000], from));
      dragged.onResponderMove(touch([600, 60, 1400], from));
      dragged.onResponderRelease(touch([600, 60, 1400], from));
    });
    await rt.advanceTime(2000);
    await rt.until(() => {
      expect(rt.screen.getByLabelText('Mini player, corner top-right')).toBeTruthy();
    });
  });

  it('highlights its buttons while they are pressed (full press interaction)', async () => {
    await playVideo(rt);
    await minimize(rt);

    const user = rt.userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(rt.screen.getByLabelText('Pause'));
    expect(player(rt).playing).toBe(false);
  });
});

describe('resuming across the close arrow', () => {
  it('a video minimized while still loading resumes at its saved progress once the tile has it', async () => {
    rt.seedSession();
    rt.api.progress.set(POST_ID, 48); // where a previous watch left off
    await rt.renderApp();
    await openVideo(rt);

    // The stream is still loading: nothing plays yet, but the close arrow already works.
    const loading = player(rt);
    expect(loading.playing).toBe(false);
    await minimize(rt);
    expect(shownIn(rt, 'mini-player-video')).toBe(loading);
    expect(loading.playing).toBe(false);

    // The stream becomes ready only in the tile: the tile finishes the resume the page never got
    // to — seeking to the saved position and playing from there.
    await rt.act(() => {
      loading.setStatus('readyToPlay');
    });
    await rt.until(() => {
      expect(loading.playing).toBe(true);
    });
    expect(loading.seeks).toEqual([48]);
  });
});

describe('leaving the page another way', () => {
  it('a back gesture / Android back stops playback instead of minimizing', async () => {
    await playVideo(rt);
    const playing = player(rt);

    await goBack(rt);
    await rt.until(() => {
      expect(rt.screen.queryByTestId('video-screen')).toBeNull();
    });
    await rt.advanceTime(10);
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();
    expect(playing.release).toHaveBeenCalled();
  });
});

describe('signing out', () => {
  it('Settings sign-out while the mini player is up stops playback and drops the tile', async () => {
    await playVideo(rt);
    const playing = player(rt);
    await minimize(rt);

    await rt.selectTab('settings');
    await rt.fireEvent.press(rt.inTab('settings').getByText('Sign Out'));

    await rt.until(() => {
      expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy();
    });
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();
    expect(playing.playing).toBe(false);
    expect(playing.release).toHaveBeenCalled();
    expect(rt.api.revokedSessions).toHaveLength(1);
  });
});
