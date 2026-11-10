import type { ReactNode } from 'react';
import type { VideoPlayer } from 'expo-video';
import { act, renderHook } from '@testing-library/react-native';
import type { MockVideoPlayer } from '@test/mocks/expo-video';

import {
  PlaybackProvider,
  usePlaybackSession,
  usePlaybackStore,
  useSessionPlayer,
  type PlaybackMedia,
} from '@/components/player/PlaybackSession';

const SOURCE = { uri: 'https://edge.floatplane.test/a.m3u8' };
const video = (id: string): PlaybackMedia => ({
  key: `video:${id}`,
  kind: 'video',
  id,
  title: `Video ${id}`,
});
const mock = (player: VideoPlayer) => player as unknown as MockVideoPlayer;

/** Run the retire `acquire` queues for a replaced player. */
const flushMicrotasks = () => act(() => Promise.resolve());

/** Flush the deferred release a detach schedules. */
const tick = () =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(1);
  });

describe('PlaybackProvider + hooks', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <PlaybackProvider>{children}</PlaybackProvider>
  );

  it('shares one session between player views and observers', async () => {
    const { result } = await renderHook(
      () => ({
        session: usePlaybackSession(),
        acquired: useSessionPlayer(SOURCE, jest.fn(), video('a')),
        store: usePlaybackStore(),
      }),
      { wrapper },
    );
    expect(result.current.acquired.reused).toBe(false);
    expect(result.current.session).toMatchObject({
      media: video('a'),
      player: result.current.acquired.player,
    });

    await act(() => {
      result.current.store?.minimize();
    });
    expect(result.current.session?.minimized).toBe(true);
  });

  it('stops playback when it turns inactive (sign-out)', async () => {
    let active = true;
    const { result, rerender } = await renderHook(
      () => ({ session: usePlaybackSession(), store: usePlaybackStore() }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <PlaybackProvider active={active}>{children}</PlaybackProvider>
        ),
      },
    );
    const { store } = result.current;
    if (!store) {
      throw new Error('rendered inside a PlaybackProvider');
    }
    const { player } = store.acquire(video('a'), SOURCE);
    await act(() => {
      store.attach(player);
    });
    expect(result.current.session).not.toBeNull();

    active = false;
    await rerender({});
    expect(result.current.session).toBeNull();
    // Still attached to a (pretend) view: paused now, released when that view unmounts.
    expect(mock(player).pause).toHaveBeenCalled();
    store.detach(player);
    await tick();
    expect(mock(player).release).toHaveBeenCalled();
  });

  it('without a provider (or media) the view owns a private player, released on unmount', async () => {
    expect((await renderHook(() => usePlaybackSession())).result.current).toBeNull();

    const setup = jest.fn();
    const { result, unmount } = await renderHook(() => useSessionPlayer(SOURCE, setup));
    const { player } = result.current;
    expect(setup).toHaveBeenCalledWith(player);
    await unmount();
    await tick();
    expect(mock(player).release).toHaveBeenCalledTimes(1);
  });

  it('a player view without media ignores the app session', async () => {
    const { result } = await renderHook(
      () => ({ acquired: useSessionPlayer(SOURCE, jest.fn()), session: usePlaybackSession() }),
      {
        wrapper,
      },
    );
    expect(result.current.acquired.reused).toBe(false);
    expect(result.current.session).toBeNull();
  });

  it('useSessionPlayer tells its view whether its player is the session’s', async () => {
    const { result } = await renderHook(
      () => ({
        acquired: useSessionPlayer(SOURCE, jest.fn(), video('a')),
        store: usePlaybackStore(),
      }),
      {
        wrapper,
      },
    );
    const { player } = result.current.acquired;
    expect(result.current.acquired.isCurrent()).toBe(true);

    // Another page's playback replaces the session: this view's player is suspended, not current.
    await act(() => {
      result.current.store?.acquire(video('b'), SOURCE);
    });
    await flushMicrotasks();
    expect(result.current.acquired.isCurrent()).toBe(false);
    expect(mock(player).pause).toHaveBeenCalled();
  });
});
