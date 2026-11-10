import type { VideoViewProps } from 'expo-video';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { items as secureStore } from '@test/mocks/expo-secure-store';
import { mockVideoPlayerState, type MockVideoPlayer } from '@test/mocks/expo-video';

import { CONTROLS_HIDE_MS } from '@/components/player/constants';
import { DOUBLE_TAP_MS } from '@/hooks/use-player-gestures';
import { VideoPlayer } from '@/components/player/VideoPlayer';

const SOURCE = { uri: 'https://edge.floatplane.test/guid/1080.m3u8', contentType: 'hls' as const };

const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

async function renderPlayer(props: Partial<Parameters<typeof VideoPlayer>[0]> = {}) {
  const onFullscreenChange = jest.fn();
  const onBack = jest.fn();
  const onSaveProgress = jest.fn();
  const baseProps = {
    source: SOURCE,
    title: 'Test Video',
    onFullscreenChange,
    onBack,
    onSaveProgress,
  };
  const provider = (extra: Partial<Parameters<typeof VideoPlayer>[0]>) => (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
      }}
    >
      <VideoPlayer fullscreen={false} {...baseProps} {...props} {...extra} />
    </SafeAreaProvider>
  );
  const utils = await render(provider({}));
  const rerenderWith = async (extra: Partial<Parameters<typeof VideoPlayer>[0]>) => {
    await utils.rerender(provider(extra));
  };
  await fireEvent.layout(screen.getByTestId('player-gesture-surface'), { width: 300, height: 170 });
  return {
    onFullscreenChange,
    onBack,
    onSaveProgress,
    player: mockVideoPlayerState.lastPlayer(),
    rerenderWith,
    unmount: utils.unmount,
  };
}

const tap = (locationX: number) =>
  fireEvent.press(screen.getByTestId('player-gesture-surface'), { nativeEvent: { locationX } });

const startPlaying = async (player: MockVideoPlayer, at = 100) => {
  await act(() => {
    player.setStatus('readyToPlay');
  });
  expect(player.play).toHaveBeenCalled();
  Object.assign(player, { currentTime: at });
  await act(() => {
    player.emit('timeUpdate', {
      currentTime: at,
      bufferedPosition: 0,
      currentLiveTimestamp: null,
      currentOffsetFromLive: null,
    });
  });
};

const controlsVisible = () => {
  expect(screen.queryByTestId('player-controls')).toBeTruthy();
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('VideoPlayer', () => {
  it('renders the video view over the gesture surface and configures the player', async () => {
    const { player } = await renderPlayer();

    expect(screen.getByTestId('video-player')).toBeTruthy();
    expect(screen.getByTestId('video-view')).toBeTruthy();
    expect(mockVideoPlayerState.viewProps?.player).toBe(player);
    expect(player.timeUpdateEventInterval).toBe(0.5);
    expect(player.staysActiveInBackground).toBe(true);
    expect(player.showNowPlayingNotification).toBe(true);
    // The source is read once at mount.
    expect(mockVideoPlayerState.players).toHaveLength(1);
    expect(player.source).toEqual(SOURCE);
  });

  it('uses the fallback duration until the stream reports its own', async () => {
    const { player } = await renderPlayer({ fallbackDuration: 600 });
    player.duration = 600;

    expect(screen.getByTestId('player-time')).toHaveTextContent('0:00 / 10:00');
  });

  it('toggles fullscreen and goes back through the controls', async () => {
    const { onFullscreenChange, onBack, rerenderWith } = await renderPlayer();

    await fireEvent.press(screen.getByRole('button', { name: 'Enter fullscreen' }));
    expect(onFullscreenChange).toHaveBeenCalledWith(true);

    // The parent flips the prop; in fullscreen both the exit button and the back arrow leave fullscreen.
    await rerenderWith({ fullscreen: true });
    await fireEvent.press(screen.getByRole('button', { name: 'Exit fullscreen' }));
    expect(onFullscreenChange).toHaveBeenLastCalledWith(false);
    onFullscreenChange.mockClear();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onFullscreenChange).toHaveBeenLastCalledWith(false);
    expect(onBack).not.toHaveBeenCalled();

    await rerenderWith({ fullscreen: false });
    await fireEvent.press(screen.getByRole('button', { name: 'Close video' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('reports watch progress as the position advances and on unmount', async () => {
    const { player, onSaveProgress, unmount } = await renderPlayer();
    await startPlaying(player); // timeUpdate(100)

    await act(() => {
      player.emit('timeUpdate', {
        currentTime: 120,
        bufferedPosition: 0,
        currentLiveTimestamp: null,
        currentOffsetFromLive: null,
      });
    });
    expect(onSaveProgress).toHaveBeenLastCalledWith(120);

    await unmount();
    expect(onSaveProgress).toHaveBeenLastCalledWith(120);
  });
});

describe('VideoPlayer controls visibility', () => {
  it('shows the controls immediately, and keeps them while paused', async () => {
    const { player } = await renderPlayer();
    controlsVisible();

    await advance(CONTROLS_HIDE_MS * 3);
    controlsVisible(); // paused → never auto-hidden
    expect(player.play).not.toHaveBeenCalled();
  });

  it('hides the controls after a few idle seconds while playing, and a tap brings them back', async () => {
    const { player } = await renderPlayer();
    await startPlaying(player);

    await advance(CONTROLS_HIDE_MS);
    expect(screen.queryByTestId('player-controls')).toBeNull();

    // A single tap only counts once the double-tap window has passed.
    await tap(150);
    await advance(DOUBLE_TAP_MS);
    controlsVisible();

    await tap(150);
    await advance(DOUBLE_TAP_MS);
    expect(screen.queryByTestId('player-controls')).toBeNull();
  });

  it('keeps the controls up while scrubbing and while the speed menu is open', async () => {
    const { player } = await renderPlayer();
    player.duration = 600; // before the renders below so the seek bar sees a duration
    await startPlaying(player);
    const bar = screen.getByTestId('player-seek-bar');
    await fireEvent.layout(bar, { width: 200, height: 28 });

    await fireEvent(bar, 'responderGrant', { nativeEvent: { locationX: 100 } });
    await advance(CONTROLS_HIDE_MS * 2);
    controlsVisible(); // scrubbing pins them
    await fireEvent(bar, 'responderRelease', { nativeEvent: { locationX: 100 } });
    expect(player.seeks).toContain(300); // 100 / 200 * 600s

    await fireEvent.press(screen.getByRole('button', { name: 'Playback speed Normal' }));
    await advance(CONTROLS_HIDE_MS * 2);
    controlsVisible(); // menu pins them
    await fireEvent.press(screen.getByTestId('speed-menu-backdrop'));
  });

  it('restarts the hide timer on control interaction', async () => {
    const { player } = await renderPlayer();
    await startPlaying(player);

    await advance(CONTROLS_HIDE_MS - 500);
    await fireEvent.press(screen.getByRole('button', { name: 'Forward 15 seconds' }));
    await advance(CONTROLS_HIDE_MS - 500);
    controlsVisible(); // the skip restarted the countdown

    await advance(1000);
    expect(screen.queryByTestId('player-controls')).toBeNull();
  });

  it('hides the controls while in picture-in-picture', async () => {
    await renderPlayer();
    controlsVisible();

    await act(() => {
      (screen.getByTestId('video-view').props as VideoViewProps).onPictureInPictureStart?.();
    });
    expect(screen.queryByTestId('player-controls')).toBeNull();

    await act(() => {
      (screen.getByTestId('video-view').props as VideoViewProps).onPictureInPictureStop?.();
    });
    controlsVisible();
  });
});

describe('VideoPlayer double-tap skips', () => {
  it('double-taps the left half to skip back and the right half to skip forward', async () => {
    const { player } = await renderPlayer();
    player.duration = 600;
    await startPlaying(player);

    await tap(60);
    await advance(200);
    await tap(80); // left ×2 within the window
    expect(player.seeks.at(-1)).toBe(85); // 100 − 15
    expect(screen.getByTestId('seek-feedback-back')).toHaveTextContent('−15s');

    await advance(200);
    await tap(240);
    await advance(200);
    await tap(260); // right ×2
    expect(player.seeks.at(-1)).toBe(100); // 85 + 15
    expect(screen.getByTestId('seek-feedback-forward')).toHaveTextContent('+15s');

    // The bubbles fade; the double taps never toggled the controls.
    await advance(CONTROLS_HIDE_MS + 700);
    expect(screen.queryByTestId('seek-feedback-forward')).toBeNull();
    expect(screen.queryByTestId('seek-feedback-back')).toBeNull();
  });

  it('accumulates repeated double taps on the same side', async () => {
    const { player } = await renderPlayer();
    player.duration = 600;
    await startPlaying(player);

    for (const x of [60, 70, 80]) {
      await tap(x);
      await advance(150);
    }
    // Three quick taps = two double taps: −15s then another −15s.
    expect(screen.getByTestId('seek-feedback-back')).toHaveTextContent('−30s');
    expect(player.seeks.at(-1)).toBe(70);
  });

  it('clamps skips to the video bounds', async () => {
    const { player } = await renderPlayer();
    player.duration = 600;
    await startPlaying(player, 8);

    await tap(60);
    await advance(200);
    await tap(70); // 8 − 15 → clamped to 0
    expect(player.seeks.at(-1)).toBe(0);
  });
});

describe('VideoPlayer press and hold for 2×', () => {
  it('boosts to 2× while held and restores the chosen speed after', async () => {
    const { player } = await renderPlayer();
    await startPlaying(player);

    await fireEvent(screen.getByTestId('player-gesture-surface'), 'longPress');
    expect(player.playbackRate).toBe(2);
    expect(screen.getByTestId('hold-speed-badge')).toHaveTextContent('2× ▸▸');
    expect(screen.queryByTestId('player-controls')).toBeNull(); // hidden while holding

    await fireEvent(screen.getByTestId('player-gesture-surface'), 'pressOut');
    expect(player.playbackRate).toBe(1); // stored rate
    expect(screen.queryByTestId('hold-speed-badge')).toBeNull();
  });

  it('ignores holds while paused', async () => {
    const { player } = await renderPlayer();

    await fireEvent(screen.getByTestId('player-gesture-surface'), 'longPress');
    expect(player.playbackRate).toBe(1);
    expect(screen.queryByTestId('hold-speed-badge')).toBeNull();
  });
});

describe('VideoPlayer speed menu', () => {
  it('persists the chosen speed and applies it', async () => {
    const { player } = await renderPlayer();
    await startPlaying(player);

    await fireEvent.press(screen.getByRole('button', { name: 'Playback speed Normal' }));
    await fireEvent.press(screen.getByTestId('speed-option-1.5'));

    expect(screen.queryByTestId('speed-option-1.5')).toBeNull(); // closed
    expect(player.playbackRate).toBe(1.5);
    expect(screen.getByRole('button', { name: 'Playback speed 1.5×' })).toBeTruthy();
    expect(secureStore.get('playbackSpeed')).toBe('1.5');
  });

  it('a new mount picks up the stored speed', async () => {
    secureStore.set('playbackSpeed', '2');
    const { player } = await renderPlayer();
    await startPlaying(player);

    expect(player.playbackRate).toBe(2);
    expect(screen.getByRole('button', { name: 'Playback speed 2×' })).toBeTruthy();
  });
});

describe('VideoPlayer play / pause / replay', () => {
  it('starts, pauses and resumes', async () => {
    const { player } = await renderPlayer();

    await startPlaying(player);
    await fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    expect(player.pause).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('button', { name: 'Play' }));
    expect(player.play).toHaveBeenCalledTimes(2);
  });

  it('replays when the stream ended', async () => {
    const { player } = await renderPlayer();
    await startPlaying(player);

    await act(() => {
      player.emit('playToEnd');
    });
    expect(screen.getByRole('button', { name: 'Replay' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Replay' }));
    expect(player.replay).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy(); // playing again → ended cleared
  });

  it('shows a buffering spinner while loading', async () => {
    const { player } = await renderPlayer();

    await act(() => {
      player.setStatus('loading');
    });
    expect(screen.getByTestId('player-loading')).toBeTruthy();

    await act(() => {
      player.setStatus('readyToPlay');
    });
    expect(screen.queryByTestId('player-loading')).toBeNull();
  });
});
