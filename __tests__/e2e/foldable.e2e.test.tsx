/**
 * E2E: foldables. Half-opening the device like a laptop (tabletop, hinge across the window) splits
 * the player page: the video above the hinge, the controls on the half below (YouTube's flex
 * mode). Unfolding flat restores the normal page. The window is an unfolded foldable's inner
 * screen: portrait 750×1334 — a large screen, so tabletop mode wins over the side-by-side layout.
 */
import { LIVESTREAM_ID, techCreator } from '@test/fixtures';
import { LARGE_PORTRAIT_WINDOW } from '@test/window-size';

import { loadRuntime, type Runtime } from './helpers/runtime';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
  rt.setWindow(LARGE_PORTRAIT_WINDOW);
});

const POST_ID = 'ch-tech-main-01';
/** Android (Jetpack WindowManager) reports the hinge's bounds in window dp. */
const ANDROID_TABLETOP = {
  state: 'halfOpened' as const,
  orientation: 'horizontal' as const,
  bounds: { x: 0, y: 660, width: 750, height: 14 },
};

async function openVideo() {
  rt.seedSession();
  await rt.renderApp();
  await rt.until(() => {
    expect(rt.inTab('index').getByTestId(`video-list-item-${POST_ID}`)).toBeTruthy();
  });
  await rt.fireEvent.press(rt.inTab('index').getByTestId(`video-list-item-${POST_ID}`));
  await rt.until(() => {
    expect(rt.screen.getByTestId('video-player')).toBeTruthy();
  });
  await rt.until(() => {
    expect(rt.screen.getByTestId('comment-list')).toBeTruthy();
  });
}

const fold = (posture: Parameters<Runtime['foldPosture']['set']>[0]) =>
  rt.act(() => {
    rt.foldPosture.set(posture);
  });

describe('tabletop posture on the video page', () => {
  it('puts the video above the hinge and the controls below it, then restores the page when unfolded', async () => {
    await openVideo();

    await fold(ANDROID_TABLETOP);
    await rt.until(() => {
      expect(rt.screen.getByTestId('player-tabletop-panel')).toBeTruthy();
    });
    expect(rt.screen.getByTestId('player-video-area')).toHaveStyle({ top: 0, height: 660 });
    expect(rt.screen.getByTestId('player-tabletop-panel')).toHaveStyle({ top: 674, bottom: 0 });
    expect(rt.screen.queryByTestId('comment-list')).toBeNull();
    expect(rt.screen.getByRole('button', { name: 'Close video' })).toBeTruthy();
    expect(rt.screen.queryByRole('button', { name: 'Enter fullscreen' })).toBeNull();

    // The panel's controls drive the player.
    await rt.act(() => {
      rt.mockVideoPlayerState.lastPlayer().setStatus('readyToPlay');
    });
    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Pause' }));
    expect(rt.mockVideoPlayerState.lastPlayer().playing).toBe(false);

    await fold({ ...ANDROID_TABLETOP, state: 'flat' });
    await rt.until(() => {
      expect(rt.screen.getByTestId('comment-list')).toBeTruthy();
    });
    expect(rt.screen.queryByTestId('player-tabletop-panel')).toBeNull();
    expect(rt.screen.getByRole('button', { name: 'Enter fullscreen' })).toBeTruthy();
  });

  it('splits a portrait window in the middle when only the hinge state is known (iPhone)', async () => {
    await openVideo();
    await fold({ state: 'halfOpened', angle: 1.5 });
    await rt.until(() => {
      expect(rt.screen.getByTestId('player-tabletop-panel')).toBeTruthy();
    });
    expect(rt.screen.getByTestId('player-video-area')).toHaveStyle({ height: 667 });
  });

  it('ignores book posture (vertical hinge)', async () => {
    await openVideo();
    await fold({
      state: 'halfOpened',
      orientation: 'vertical',
      bounds: { x: 370, y: 0, width: 10, height: 1334 },
    });
    await rt.advanceTime(100);
    expect(rt.screen.queryByTestId('player-tabletop-panel')).toBeNull();
    expect(rt.screen.getByTestId('comment-list')).toBeTruthy();
  });

  it('ignores a hinge the window does not span (at its top or below its bottom)', async () => {
    await openVideo();

    // Hinge flush with the window's top edge: nothing above it to show the video in.
    await fold({ ...ANDROID_TABLETOP, bounds: { x: 0, y: 0, width: 750, height: 14 } });
    await rt.advanceTime(100);
    expect(rt.screen.queryByTestId('player-tabletop-panel')).toBeNull();
    expect(rt.screen.getByTestId('comment-list')).toBeTruthy();

    // Hinge ending past the window's bottom edge: no lower half for the controls.
    await fold({ ...ANDROID_TABLETOP, bounds: { x: 0, y: 1320, width: 750, height: 14 } });
    await rt.advanceTime(100);
    expect(rt.screen.queryByTestId('player-tabletop-panel')).toBeNull();
    expect(rt.screen.getByTestId('comment-list')).toBeTruthy();
  });

  it('closing from the panel hands the video to the mini player', async () => {
    await openVideo();
    await fold(ANDROID_TABLETOP);
    await rt.until(() => {
      expect(rt.screen.getByTestId('player-tabletop-panel')).toBeTruthy();
    });

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Close video' }));
    await rt.until(() => {
      expect(rt.screen.getByTestId('mini-player')).toBeTruthy();
    });
    expect(rt.screen.queryByTestId('video-screen')).toBeNull();
  });

  it('reopening from the mini player while still folded restores the tabletop split on the same player', async () => {
    await openVideo();
    const playing = rt.mockVideoPlayerState.lastPlayer();
    await fold(ANDROID_TABLETOP);
    await rt.until(() => {
      expect(rt.screen.getByTestId('player-tabletop-panel')).toBeTruthy();
    });

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Close video' }));
    await rt.until(() => {
      expect(rt.screen.getByTestId('mini-player')).toBeTruthy();
    });
    // Still folded, the tile keeps playing…
    expect(rt.mockVideoPlayerState.viewsByTestID.get('mini-player-video')?.player).toBe(playing);

    // …and tapping it reopens the page straight back into the split, without a reload.
    await rt.fireEvent.press(rt.screen.getByTestId('mini-player-expand'));
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-screen')).toBeTruthy();
    });
    await rt.until(() => {
      expect(rt.screen.getByTestId('player-tabletop-panel')).toBeTruthy();
    });
    expect(rt.screen.getByTestId('player-video-area')).toHaveStyle({ top: 0, height: 660 });
    expect(rt.screen.queryByTestId('comment-list')).toBeNull();
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();
    expect(rt.mockVideoPlayerState.players).toHaveLength(1);
    expect(rt.mockVideoPlayerState.viewsByTestID.get('video-view')?.player).toBe(playing);
  });
});

describe('tabletop posture on the live page', () => {
  it('splits the live player too', async () => {
    rt.api.liveNow.add(LIVESTREAM_ID);
    rt.seedSession();
    await rt.renderApp();
    await rt.selectTab('live');
    await rt.until(() => {
      expect(rt.inTab('live').getByTestId('live-status-live')).toBeTruthy();
    });
    await rt.fireEvent.press(rt.inTab('live').getByTestId(`live-stream-${techCreator.id}`));
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-player')).toBeTruthy();
    });

    await fold(ANDROID_TABLETOP);
    await rt.until(() => {
      expect(rt.screen.getByTestId('player-tabletop-panel')).toBeTruthy();
    });
    expect(rt.screen.getByTestId('player-live-badge')).toBeTruthy();
  });
});
