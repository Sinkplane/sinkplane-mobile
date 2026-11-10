/**
 * Shared steps of the mini player E2E suites (mini-player*.e2e.test.tsx): open and play a video or
 * the Tech livestream, hand it to the mini player, and synthesize drag touches for the tile.
 */
import type { GestureResponderEvent } from 'react-native';
import { techCreator } from '@test/fixtures';
import type { MockVideoPlayer } from '@test/mocks/expo-video';

import type { Runtime } from './runtime';

export const POST_ID = 'ch-tech-main-01';
export const OTHER_ID = 'ch-tech-main-02';

/** The most recently created fake player. */
export const player = (rt: Runtime): MockVideoPlayer => rt.mockVideoPlayerState.lastPlayer();

/** The player a `VideoView` (by testID) currently shows. */
export const shownIn = (
  rt: Runtime,
  testID: 'video-view' | 'mini-player-video',
): MockVideoPlayer | null | undefined => rt.mockVideoPlayerState.viewsByTestID.get(testID)?.player;

export async function openVideo(rt: Runtime, id = POST_ID): Promise<void> {
  await rt.until(() => {
    expect(rt.inTab('index').getByTestId(`video-list-item-${id}`)).toBeTruthy();
  });
  await rt.fireEvent.press(rt.inTab('index').getByTestId(`video-list-item-${id}`));
  await rt.until(() => {
    expect(rt.screen.getByTestId('video-player')).toBeTruthy();
  });
}

/** The current player's stream becomes playable (autoplay starts it). */
export async function readyToPlay(rt: Runtime): Promise<void> {
  await rt.act(() => {
    player(rt).setStatus('readyToPlay');
  });
}

/** Sign in, open the first video and let it start playing. */
export async function playVideo(rt: Runtime): Promise<void> {
  rt.seedSession();
  await rt.renderApp();
  await openVideo(rt);
  await readyToPlay(rt);
  expect(player(rt).playing).toBe(true);
}

/** Navigate like a notification / deep link would (`push`) or go back. */
export async function pushRoute(rt: Runtime, path: `/video/${string}`): Promise<void> {
  await rt.act(() => {
    rt.router.push(path);
  });
}

export async function goBack(rt: Runtime): Promise<void> {
  await rt.act(() => {
    rt.router.back();
  });
}

export async function minimize(rt: Runtime): Promise<void> {
  await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Close video' }));
  await rt.until(() => {
    expect(rt.screen.getByTestId('mini-player')).toBeTruthy();
  });
}

/** Sign in with the Tech livestream live, open it from the Live tab and let it play. */
export async function playLiveStream(rt: Runtime, liveStreamId: string): Promise<void> {
  rt.api.liveNow.add(liveStreamId);
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
  await readyToPlay(rt);
}

/** A recoverable playback error on the current player (the live page reloads the stream 5s later). */
export async function failStream(rt: Runtime): Promise<void> {
  const target = player(rt);
  await rt.act(() => {
    target.status = 'error';
    target.emit('statusChange', {
      status: 'error',
      error: { message: 'The network connection was lost.' },
    });
  });
}

interface TouchPoint {
  x: number;
  y: number;
  timestamp: number;
}

/**
 * A single-touch responder event at `[x, y, timestamp]` for a gesture that began at `start`: the
 * `touchHistory` PanResponder computes gestures from.
 */
export function touch(
  [x, y, timestamp]: [number, number, number],
  start: TouchPoint = { x: 300, y: 100, timestamp: 0 },
): GestureResponderEvent {
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

/** The PanResponder handlers the mini player tile spreads onto its view. */
export interface TileResponder {
  onMoveShouldSetResponderCapture: (event: GestureResponderEvent) => boolean;
  onResponderGrant: (event: GestureResponderEvent) => void;
  onResponderMove: (event: GestureResponderEvent) => void;
  onResponderRelease: (event: GestureResponderEvent) => void;
}

/** The mini player tile's responder handlers. */
export const tileResponder = (rt: Runtime): TileResponder =>
  rt.screen.getByTestId('mini-player').props as TileResponder;
