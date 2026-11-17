import { useEffect, type ReactElement } from 'react';
import type { VideoPlayer } from 'expo-video';
import { act, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { MockVideoPlayer } from '@test/mocks/expo-video';

import { MiniPlayer } from '@/components/player/MiniPlayer';
import {
  PlaybackProvider,
  usePlaybackStore,
  type PlaybackMedia,
  type PlaybackStore,
} from '@/components/player/PlaybackSession';
import { useWatchProgress } from '@/hooks/use-watch-progress';
import { mockNetwork } from '@test/mocks/expo-network';

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

const VIDEO: PlaybackMedia = {
  key: 'video:a',
  kind: 'video',
  id: 'a',
  title: 'Video A',
  subtitle: 'Tech',
};
const LIVE: PlaybackMedia = { key: 'live:x:0:url', kind: 'live', id: 'x', title: 'Live X' };

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

const METRICS = {
  frame: { x: 0, y: 0, width: 400, height: 800 },
  insets: { top: 40, bottom: 20, left: 0, right: 0 },
};
const app = (child: ReactElement) => (
  <SafeAreaProvider initialMetrics={METRICS}>
    <PlaybackProvider>
      <CaptureStore />
      {child}
    </PlaybackProvider>
  </SafeAreaProvider>
);

/** The page's progress hook, mounted while its player plays on the page. */
function PageProgress({ player }: { player: VideoPlayer }) {
  useWatchProgress(player);
  return null;
}

/** Render the overlay with `media` playing and handed to the mini player (the page's close arrow). */
async function renderMinimized(media: PlaybackMedia = VIDEO) {
  const utils = await render(app(<MiniPlayer />));
  const { player } = store.acquire(media, { uri: 'https://edge.floatplane.test/a.m3u8' });
  const mock = player as unknown as MockVideoPlayer;
  // The page's progress hook started this player before the close arrow handed it to the tile, so
  // the tile must neither seek nor autoplay (the not-yet-started case has its own test below).
  mock.status = 'readyToPlay';
  await utils.rerender(
    app(
      <>
        <PageProgress player={player} />
        <MiniPlayer />
      </>,
    ),
  );
  // The page unmounts (its close arrow): only the tile remains.
  await utils.rerender(app(<MiniPlayer />));
  mock.play.mockClear();
  mock.playing = true;
  await act(() => {
    store.attach(player);
    store.minimize();
    store.detach(player);
  });
  return mock;
}

describe('MiniPlayer progress', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPathname = '/';
    mockToken = 'token';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps saving watch progress for videos without seeking or restarting', async () => {
    const player = await renderMinimized();
    player.currentTime = 40;
    await act(() => {
      player.emit('timeUpdate', {
        currentTime: 40,
        bufferedPosition: 40,
        currentLiveTimestamp: null,
        currentOffsetFromLive: null,
      });
    });
    expect(mockMutate).toHaveBeenCalledWith({ id: 'a', progress: 40 });
    expect(player.seeks).toEqual([40]); // only the test's own assignment
    expect(player.play).not.toHaveBeenCalled();
  });

  it('saves no progress while offline, and again once the network is back', async () => {
    mockNetwork.offline();
    const player = await renderMinimized();
    const tick = (currentTime: number) =>
      act(() => {
        player.emit('timeUpdate', {
          currentTime,
          bufferedPosition: currentTime,
          currentLiveTimestamp: null,
          currentOffsetFromLive: null,
        });
      });
    await tick(40);
    expect(mockMutate).not.toHaveBeenCalled();

    await act(() => {
      mockNetwork.online();
    });
    await tick(70);
    expect(mockMutate).toHaveBeenCalledWith({ id: 'a', progress: 70 });
  });

  it('resumes a video that was still loading when minimized, at the position the page saved', async () => {
    await render(app(<MiniPlayer />));
    const { player } = store.acquire(
      { ...VIDEO, resumeAt: 37 },
      { uri: 'https://edge.floatplane.test/a.m3u8' },
    );
    const mock = player as unknown as MockVideoPlayer;
    mock.status = 'loading';
    await act(() => {
      store.attach(player);
      store.minimize();
      store.detach(player);
    });
    expect(screen.getByTestId('mini-player')).toBeTruthy();
    // The tile took over a player nobody started: nothing to seek or play yet.
    expect(mock.play).not.toHaveBeenCalled();
    expect(mock.seeks).toEqual([]);

    // The stream becomes ready: the tile finishes the resume at the saved position and plays.
    await act(() => {
      mock.setStatus('readyToPlay');
    });
    expect(mock.seeks).toEqual([37]);
    expect(mock.play).toHaveBeenCalledTimes(1);
    expect(mock.playing).toBe(true);
  });

  it('saves no progress for live streams or without a session token', async () => {
    const live = await renderMinimized(LIVE);
    await act(() => {
      live.emit('timeUpdate', {
        currentTime: 60,
        bufferedPosition: 60,
        currentLiveTimestamp: null,
        currentOffsetFromLive: null,
      });
    });
    mockToken = null;
    const video = await renderMinimized({ ...VIDEO, key: 'video:c', id: 'c' });
    await act(() => {
      video.emit('timeUpdate', {
        currentTime: 60,
        bufferedPosition: 60,
        currentLiveTimestamp: null,
        currentOffsetFromLive: null,
      });
    });
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
