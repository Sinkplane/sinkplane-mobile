import type { ReactElement } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { MockVideoPlayer } from '@test/mocks/expo-video';

import { isPlayerRoute, MiniPlayer } from '@/components/player/MiniPlayer';
import { PlaybackProvider, usePlaybackStore, type PlaybackMedia, type PlaybackStore } from '@/components/player/PlaybackSession';

const mockPush = jest.fn();
let mockPathname = '/';
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

const mockMutate = jest.fn();
let mockToken: string | null = 'token';
jest.mock('@/shared', () => ({
  useSession: () => ({ token: mockToken }),
  useUpdateVideoProgress: () => ({ mutate: mockMutate }),
}));

const VIDEO: PlaybackMedia = { key: 'video:a', kind: 'video', id: 'a', title: 'Video A', subtitle: 'Tech' };
const LIVE: PlaybackMedia = { key: 'live:x:0:url', kind: 'live', id: 'x', title: 'Live X' };

let store: PlaybackStore;
function CaptureStore() {
  store = usePlaybackStore() as PlaybackStore;
  return null;
}

const METRICS = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 40, bottom: 20, left: 0, right: 0 } };
const app = (child: ReactElement) => (
  <SafeAreaProvider initialMetrics={METRICS}>
    <PlaybackProvider>
      <CaptureStore />
      {child}
    </PlaybackProvider>
  </SafeAreaProvider>
);

/** Render the overlay with `media` playing and handed to the mini player (the page's close arrow). */
async function renderMinimized(media: PlaybackMedia = VIDEO) {
  await render(app(<MiniPlayer />));
  const { player } = store.acquire(media, { uri: 'https://edge.floatplane.test/a.m3u8' });
  const mock = player as unknown as MockVideoPlayer;
  mock.status = 'readyToPlay';
  mock.playing = true;
  await act(async () => {
    store.attach(player);
    store.minimize();
    store.detach(player);
  });
  return mock;
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

describe('MiniPlayer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPathname = '/';
    mockToken = 'token';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stays hidden until a playback is minimized', async () => {
    await render(app(<MiniPlayer />));
    expect(screen.queryByTestId('mini-player')).toBeNull();

    const { player } = store.acquire(VIDEO, { uri: 'x' });
    await act(async () => store.attach(player));
    expect(screen.queryByTestId('mini-player')).toBeNull();

    await act(async () => store.minimize());
    expect(screen.getByTestId('mini-player')).toBeTruthy();
    expect(screen.getByLabelText('Mini player, corner top-right')).toBeTruthy();
    expect(screen.getByTestId('mini-player-video').props.allowsPictureInPicture).toBe(true);
  });

  it('hides on the player pages themselves', async () => {
    mockPathname = '/video/a';
    await renderMinimized();
    expect(screen.queryByTestId('mini-player')).toBeNull();
    expect(isPlayerRoute('/live/x')).toBe(true);
    expect(isPlayerRoute('/history')).toBe(false);
  });

  it('reopens the video page, or the live page, when tapped', async () => {
    await renderMinimized();
    await fireEvent.press(screen.getByLabelText('Open Video A'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/video/[id]', params: { id: 'a' } });

    await renderMinimized(LIVE);
    await fireEvent.press(screen.getByLabelText('Open Live X'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/live/[id]', params: { id: 'x' } });
  });

  it('labels an untitled playback generically', async () => {
    await renderMinimized({ key: 'video:b', kind: 'video', id: 'b' });
    expect(screen.getByLabelText('Open video')).toBeTruthy();
  });

  it('pauses and resumes', async () => {
    const player = await renderMinimized();
    await fireEvent.press(screen.getByLabelText('Pause'));
    expect(player.pause).toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Play'));
    expect(player.play).toHaveBeenCalled();
  });

  it('closing stops playback and removes the tile', async () => {
    const player = await renderMinimized();
    await fireEvent.press(screen.getByLabelText('Close mini player'));
    expect(screen.queryByTestId('mini-player')).toBeNull();
    expect(player.release).toHaveBeenCalled();
  });

  it('keeps saving watch progress for videos without seeking or restarting', async () => {
    const player = await renderMinimized();
    player.currentTime = 40;
    await act(async () => {
      player.emit('timeUpdate', { currentTime: 40, bufferedPosition: 40, currentLiveTimestamp: null, currentOffsetFromLive: null });
    });
    expect(mockMutate).toHaveBeenCalledWith({ id: 'a', progress: 40 });
    expect(player.seeks).toEqual([40]); // only the test's own assignment
    expect(player.play).not.toHaveBeenCalled();
  });

  it('saves no progress for live streams or without a session token', async () => {
    const live = await renderMinimized(LIVE);
    await act(async () => {
      live.emit('timeUpdate', { currentTime: 60, bufferedPosition: 60, currentLiveTimestamp: null, currentOffsetFromLive: null });
    });
    mockToken = null;
    const video = await renderMinimized({ ...VIDEO, key: 'video:c', id: 'c' });
    await act(async () => {
      video.emit('timeUpdate', { currentTime: 60, bufferedPosition: 60, currentLiveTimestamp: null, currentOffsetFromLive: null });
    });
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('drags to another corner and snaps there; small moves stay taps', async () => {
    await renderMinimized();
    const tile = screen.getByTestId('mini-player');

    expect(tile.props.onMoveShouldSetResponderCapture(touch(303, 102, 10))).toBe(false);
    expect(tile.props.onMoveShouldSetResponderCapture(touch(200, 500, 20))).toBe(true);

    await act(async () => {
      tile.props.onResponderGrant(touch(300, 100, 0));
      tile.props.onResponderMove(touch(60, 650, 400));
      tile.props.onResponderRelease(touch(60, 650, 400));
      await jest.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByLabelText('Mini player, corner bottom-left')).toBeTruthy();

    // An interrupted drag (e.g. a scroll view took over) still snaps.
    await act(async () => {
      tile.props.onResponderGrant(touch(60, 650, 1000, { x: 60, y: 650, timestamp: 1000 }));
      tile.props.onResponderMove(touch(60, 100, 1400, { x: 60, y: 650, timestamp: 1000 }));
      tile.props.onResponderTerminate(touch(60, 100, 1400, { x: 60, y: 650, timestamp: 1000 }));
      await jest.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByLabelText('Mini player, corner top-left')).toBeTruthy();
  });
});
