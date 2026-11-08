/**
 * MiniPlayer's platform-dependent geometry. `TAB_BAR_CLEARANCE` is decided once when the module
 * loads, so this file never imports MiniPlayer statically: the test overrides the platform first
 * and only then requires it (its first — Android — evaluation) while everything else (React,
 * the renderer, PlaybackSession) keeps the one iOS-resolution instance the file shares.
 */
import { Dimensions, Platform, type GestureResponderEvent } from 'react-native';
import type { ReactElement } from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PlaybackProvider, usePlaybackStore, type PlaybackMedia, type PlaybackStore } from '@/components/player/PlaybackSession';
import { MINI_PLAYER_MARGIN, miniPlayerSize } from '@/utils/mini-player-layout';

const mockPush = jest.fn();
const mockPathname = '/';
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

const mockMutate = jest.fn();
const mockToken: string | null = 'token';
jest.mock('@/shared', () => ({
  useSession: () => ({ token: mockToken }),
  useUpdateVideoProgress: () => ({ mutate: mockMutate }),
}));

const VIDEO: PlaybackMedia = { key: 'video:a', kind: 'video', id: 'a', title: 'Video A', subtitle: 'Tech' };

let store: PlaybackStore;
function CaptureStore() {
  store = usePlaybackStore() as PlaybackStore;
  return null;
}

const METRICS = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 40, bottom: 20, left: 0, right: 0 } };
const app = (MiniPlayerComponent: () => ReactElement | null) => (
  <SafeAreaProvider initialMetrics={METRICS}>
    <PlaybackProvider>
      <CaptureStore />
      <MiniPlayerComponent />
    </PlaybackProvider>
  </SafeAreaProvider>
);

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

describe('MiniPlayer on Android', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks(); // puts Platform.OS back for anything after this test
    jest.useRealTimers();
  });

  it('parks lower over the tab bar than on iOS (80pt clearance instead of 64)', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    // First evaluation of the module body — under the override — picks the Android clearance.
    const { MiniPlayer } = jest.requireActual<typeof import('@/components/player/MiniPlayer')>('@/components/player/MiniPlayer');

    await render(app(MiniPlayer));
    const { player } = store.acquire(VIDEO, { uri: 'https://edge.floatplane.test/a.m3u8' });
    await act(async () => {
      store.attach(player);
      store.minimize();
      store.detach(player);
    });

    // Fling the tile into the bottom half; it snaps to the bottom-right corner.
    const tile = screen.getByTestId('mini-player');
    await act(async () => {
      tile.props.onResponderGrant(touch(300, 100, 0));
      tile.props.onResponderMove(touch(300, 500, 400));
      tile.props.onResponderRelease(touch(300, 500, 400));
      await jest.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByLabelText('Mini player, corner bottom-right')).toBeTruthy();

    // The parked position proves the clearance: safe-area bottom (20) + tab bar (80) + margin (12).
    const window = Dimensions.get('window');
    const tileSize = miniPlayerSize(window.width);
    const expectedY = window.height - (METRICS.insets.bottom + 80 + MINI_PLAYER_MARGIN) - tileSize.height;
    const style = screen.getByTestId('mini-player').props.style as { transform?: ReadonlyArray<Record<string, unknown>> };
    const translateY = (style.transform ?? []).find(entry => 'translateY' in entry)?.translateY;
    expect(translateY).toBeCloseTo(expectedY, 0);
  });
});
