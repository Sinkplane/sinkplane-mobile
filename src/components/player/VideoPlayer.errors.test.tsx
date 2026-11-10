import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { items as secureStore } from '@test/mocks/expo-secure-store';
import { mockVideoPlayerState, type MockVideoPlayer } from '@test/mocks/expo-video';

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

describe('VideoPlayer playback errors', () => {
  const fail = (player: MockVideoPlayer, message?: string) =>
    act(() => {
      Object.assign(player, { status: 'error' });
      player.emit('statusChange', {
        status: 'error',
        error: message === undefined ? undefined : { message },
      });
    });

  it('replaces the controls with an error overlay showing the failure message', async () => {
    const { player } = await renderPlayer();
    controlsVisible();

    await fail(player, 'Stream unreachable');

    expect(screen.getByTestId('player-error')).toBeTruthy();
    expect(screen.getByText('Playback failed')).toBeTruthy();
    expect(screen.getByText('Stream unreachable')).toBeTruthy();
    expect(screen.queryByTestId('player-controls')).toBeNull();
  });

  it('omits the message line when the error carries none', async () => {
    const { player } = await renderPlayer();
    await fail(player);

    expect(screen.getByText('Playback failed')).toBeTruthy();
    expect(screen.queryByText('Stream unreachable')).toBeNull();
  });

  it('Retry reloads the original source and then plays', async () => {
    const { player } = await renderPlayer();
    await fail(player, 'boom');

    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(player.replaceAsync).toHaveBeenCalledWith(SOURCE);
    await act(() => Promise.resolve());
    expect(player.play).toHaveBeenCalled();
  });

  it('swallows a failing retry instead of crashing, and does not play', async () => {
    const { player } = await renderPlayer();
    player.replaceAsync.mockRejectedValueOnce(new Error('still down'));
    await fail(player, 'boom');

    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await act(() => Promise.resolve());

    expect(player.replaceAsync).toHaveBeenCalledTimes(1);
    expect(player.play).not.toHaveBeenCalled();
    expect(screen.getByTestId('player-error')).toBeTruthy();
  });

  it('leaves fullscreen when the stream fails, since the overlay hides the exit button', async () => {
    const { player, onFullscreenChange, rerenderWith } = await renderPlayer({ fullscreen: true });
    expect(onFullscreenChange).not.toHaveBeenCalled();

    await fail(player, 'boom');
    expect(onFullscreenChange).toHaveBeenCalledWith(false);

    await rerenderWith({ fullscreen: false });
    expect(screen.getByTestId('player-error')).toBeTruthy();
  });

  it('does not touch fullscreen on an inline error', async () => {
    const { player, onFullscreenChange } = await renderPlayer({ fullscreen: false });
    await fail(player, 'boom');
    expect(onFullscreenChange).not.toHaveBeenCalled();
  });

  it('clears the overlay once the player recovers', async () => {
    const { player } = await renderPlayer();
    await fail(player, 'boom');
    await act(() => {
      player.setStatus('readyToPlay');
    });
    expect(screen.queryByTestId('player-error')).toBeNull();
  });

  it('reports each failure through onError with the native message', async () => {
    const onError = jest.fn();
    const { player } = await renderPlayer({ onError });

    await fail(player, 'HTTP 404: File Not Found');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('HTTP 404: File Not Found');

    await act(() => {
      player.setStatus('readyToPlay');
    });
    await fail(player);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenLastCalledWith(undefined);
  });

  it('Retry calls onRetry instead of reloading the original source when given', async () => {
    const onRetry = jest.fn();
    const { player } = await renderPlayer({ onRetry });
    await fail(player, 'boom');

    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(player.replaceAsync).not.toHaveBeenCalled();
  });
});

describe('VideoPlayer live mode', () => {
  it('autoplays without saving progress and shows live controls', async () => {
    const { player, onSaveProgress, unmount } = await renderPlayer({
      live: true,
      initialTime: 120,
    });
    await startPlaying(player, 500);
    expect(player.seeks).toEqual([500]);
    await act(() => {
      player.pause();
    });

    expect(screen.getByTestId('player-live-badge')).toBeTruthy();
    expect(screen.queryByTestId('player-seek-bar')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Playback speed/ })).toBeNull();
    expect(screen.getByLabelText('Live video. Tap to show controls')).toBeTruthy();

    await unmount();
    expect(onSaveProgress).not.toHaveBeenCalled();
  });

  it('ignores double-tap seeks and press-and-hold', async () => {
    const { player } = await renderPlayer({ live: true });
    await startPlaying(player);
    const seeks = player.seeks.length;

    await tap(250);
    await advance(100);
    await tap(250);
    expect(player.seeks).toHaveLength(seeks);
    expect(screen.queryByTestId('seek-feedback-forward')).toBeNull();

    await fireEvent(screen.getByTestId('player-gesture-surface'), 'longPress');
    expect(player.playbackRate).toBe(1);
    expect(screen.queryByTestId('hold-speed-badge')).toBeNull();
  });

  it('always plays at 1× regardless of the stored speed', async () => {
    secureStore.set('playbackSpeed', JSON.stringify(1.5));
    const { player } = await renderPlayer({ live: true });
    await advance(0);
    expect(player.playbackRate).toBe(1);
  });
});
