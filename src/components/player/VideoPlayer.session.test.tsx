import { useEffect } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { mockVideoPlayerState, type MockVideoPlayer } from '@test/mocks/expo-video';

import { CONTROLS_HIDE_MS } from '@/components/player/constants';
import {
  PlaybackProvider,
  usePlaybackStore,
  type PlaybackStore,
} from '@/components/player/PlaybackSession';
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

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('VideoPlayer tabletop (foldable half-opened)', () => {
  const TABLETOP = { hingeTop: 300, hingeBottom: 320 };

  it('puts the video above the hinge and keeps the controls up on the panel below', async () => {
    const { player, onFullscreenChange } = await renderPlayer({ tabletop: TABLETOP });
    await startPlaying(player);

    expect(screen.getByTestId('player-video-area')).toHaveStyle({ top: 0, height: 300 });
    expect(screen.getByTestId('player-tabletop-panel')).toHaveStyle({ top: 320, bottom: 0 });
    expect(screen.getByTestId('video-player')).toHaveStyle({ flex: 1 });
    // The title shows, there's no fullscreen toggle (the posture decides), and nothing auto-hides.
    expect(screen.getByText('Test Video')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Enter fullscreen' })).toBeNull();
    await advance(CONTROLS_HIDE_MS + 100);
    await tap(100);
    expect(screen.getByTestId('player-tabletop-panel')).toBeTruthy();
    expect(onFullscreenChange).not.toHaveBeenCalled();
  });

  it('closes the video from the panel even when the window is landscape (fullscreen)', async () => {
    const { onBack, onFullscreenChange } = await renderPlayer({
      tabletop: TABLETOP,
      fullscreen: true,
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Close video' }));
    expect(onBack).toHaveBeenCalled();
    expect(onFullscreenChange).not.toHaveBeenCalled();
  });

  it('drops the panel during picture-in-picture and on errors', async () => {
    const { player } = await renderPlayer({ tabletop: TABLETOP });
    await act(() => {
      mockVideoPlayerState.viewProps?.onPictureInPictureStart?.();
    });
    expect(screen.queryByTestId('player-tabletop-panel')).toBeNull();
    await act(() => {
      mockVideoPlayerState.viewProps?.onPictureInPictureStop?.();
    });
    expect(screen.getByTestId('player-tabletop-panel')).toBeTruthy();

    await act(() => {
      player.status = 'error';
      player.emit('statusChange', { status: 'error', error: { message: 'boom' } });
    });
    expect(screen.queryByTestId('player-tabletop-panel')).toBeNull();
    expect(screen.getByTestId('player-error')).toBeTruthy();
  });
});

describe('VideoPlayer playback session (mini player)', () => {
  const MEDIA = { key: 'video:a', kind: 'video' as const, id: 'a', title: 'Test Video' };
  let store: PlaybackStore;
  /** Hands the provider's store to the test (captured after commit, before the test continues). */
  function CaptureStore() {
    const provided = usePlaybackStore();
    useEffect(() => {
      if (provided) {
        store = provided;
      }
    }, [provided]);
    return null;
  }
  const metrics = {
    frame: { x: 0, y: 0, width: 320, height: 640 },
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
  };
  /** The provider stays mounted; `show` mounts / unmounts the player page's player. */
  const tree = (show: boolean, initialTime?: number) => (
    <SafeAreaProvider initialMetrics={metrics}>
      <PlaybackProvider>
        <CaptureStore />
        {show ? (
          <VideoPlayer
            source={SOURCE}
            media={MEDIA}
            initialTime={initialTime}
            fullscreen={false}
            onFullscreenChange={jest.fn()}
          />
        ) : null}
      </PlaybackProvider>
    </SafeAreaProvider>
  );

  it('plays through the app session and takes over a running player without seeking or autoplaying', async () => {
    // Playing in the page, at 250s; the close arrow hands it to the mini player and the page unmounts.
    const utils = await render(tree(true));
    const running = mockVideoPlayerState.lastPlayer();
    await act(() => {
      running.setStatus('readyToPlay');
    });
    running.currentTime = 250;
    await act(() => {
      store.minimize();
    });
    await utils.rerender(tree(false));
    await advance(1);
    expect(store.getSnapshot()?.player).toBe(running);
    expect(running.release).not.toHaveBeenCalled();
    running.play.mockClear();
    const seeks = running.seeks.length;

    // Reopening the page with the post's saved progress: same player, position and play state kept.
    await utils.rerender(tree(true, 30));
    expect(mockVideoPlayerState.players).toHaveLength(1);
    expect(mockVideoPlayerState.viewProps?.player).toBe(running);
    expect(running.seeks).toHaveLength(seeks);
    expect(running.play).not.toHaveBeenCalled();
    expect(store.getSnapshot()?.minimized).toBe(false);
  });

  it('records the resume position on the session media, so a takeover of a still-loading player can finish it', async () => {
    const page = await render(tree(true, 30));
    expect(store.getSnapshot()?.media.resumeAt).toBe(30);
    await page.unmount();

    // Live streams carry no resume position (they never resume a saved watch position).
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <PlaybackProvider>
          <CaptureStore />
          <VideoPlayer
            source={SOURCE}
            media={{ key: 'live:a', kind: 'live', id: 'a' }}
            live
            initialTime={30}
            fullscreen={false}
            onFullscreenChange={jest.fn()}
          />
        </PlaybackProvider>
      </SafeAreaProvider>,
    );
    expect(store.getSnapshot()?.media.resumeAt).toBeUndefined();
  });
});
