import type { ReactNode } from 'react';
import type { VideoPlayer } from 'expo-video';
import { act, renderHook } from '@testing-library/react-native';
import { mockVideoPlayerState, type MockVideoPlayer } from '@test/mocks/expo-video';

import {
  PlaybackProvider,
  PlaybackStore,
  usePlaybackSession,
  usePlaybackStore,
  useSessionPlayer,
  type PlaybackMedia,
} from '@/components/player/PlaybackSession';

const SOURCE = { uri: 'https://edge.floatplane.test/a.m3u8' };
const video = (id: string): PlaybackMedia => ({ key: `video:${id}`, kind: 'video', id, title: `Video ${id}` });
const mock = (player: VideoPlayer) => player as unknown as MockVideoPlayer;

/** Flush the deferred release a detach schedules. */
const tick = () =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(1);
  });

describe('PlaybackStore', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates and sets up a player for new media, and reuses it for the same key', () => {
    const store = new PlaybackStore();
    const setup = jest.fn();
    const first = store.acquire(video('a'), SOURCE, setup);
    expect(first.reused).toBe(false);
    expect(setup).toHaveBeenCalledWith(first.player);
    expect(mockVideoPlayerState.players).toHaveLength(1);

    const again = store.acquire(video('a'), SOURCE, setup);
    expect(again).toEqual({ player: first.player, reused: true });
    expect(mockVideoPlayerState.players).toHaveLength(1);
  });

  it('publishes the session on attach, not while acquiring (that happens during render)', () => {
    const store = new PlaybackStore();
    const listener = jest.fn();
    store.subscribe(listener);
    const { player } = store.acquire(video('a'), SOURCE);
    expect(listener).not.toHaveBeenCalled();

    store.attach(player);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({ media: video('a'), player, minimized: false });
  });

  it('ends the session and releases the player once its last view unmounts', async () => {
    const store = new PlaybackStore();
    const { player } = store.acquire(video('a'), SOURCE);
    store.attach(player);
    store.attach(player);

    store.detach(player);
    await tick();
    expect(store.getSnapshot()?.player).toBe(player);
    expect(mock(player).release).not.toHaveBeenCalled();

    store.detach(player);
    expect(store.getSnapshot()).toBeNull();
    await tick();
    expect(mock(player).release).toHaveBeenCalledTimes(1);

    // A later mount of the same media starts over with a fresh player.
    expect(store.acquire(video('a'), SOURCE).reused).toBe(false);
  });

  it('keeps a view that re-attaches before the deferred release (effect re-run)', async () => {
    const store = new PlaybackStore();
    const { player } = store.acquire(video('a'), SOURCE);
    store.attach(player);
    store.detach(player);
    store.attach(player);
    await tick();
    expect(mock(player).release).not.toHaveBeenCalled();
  });

  it('hands a minimized player to the mini player instead of releasing it, until its page reopens', async () => {
    const store = new PlaybackStore();
    const { player } = store.acquire(video('a'), SOURCE);
    store.attach(player);

    store.minimize();
    expect(store.getSnapshot()?.minimized).toBe(true);
    store.detach(player);
    await tick();
    expect(mock(player).release).not.toHaveBeenCalled();
    expect(store.getSnapshot()?.player).toBe(player);

    // Reopening the page: same player, and the mini player steps aside.
    const reopened = store.acquire(video('a'), SOURCE);
    expect(reopened).toEqual({ player, reused: true });
    store.attach(player);
    expect(store.getSnapshot()?.minimized).toBe(false);
  });

  it('minimize is a no-op without a session or when already minimized', () => {
    const store = new PlaybackStore();
    const listener = jest.fn();
    store.subscribe(listener);
    store.minimize();
    expect(listener).not.toHaveBeenCalled();

    store.attach(store.acquire(video('a'), SOURCE).player);
    store.minimize();
    store.minimize();
    expect(listener).toHaveBeenCalledTimes(2); // attach + the first minimize
  });

  it('replacing the session pauses the old player and releases it once nothing shows it', async () => {
    const store = new PlaybackStore();
    const { player: minimized } = store.acquire(video('a'), SOURCE);
    store.attach(minimized);
    store.minimize();
    store.detach(minimized);

    // Opening another video while the mini player plays: released right away.
    store.acquire(video('b'), SOURCE);
    expect(mock(minimized).pause).toHaveBeenCalled();
    expect(mock(minimized).release).toHaveBeenCalledTimes(1);

    // Replaced while still on screen (a page under the new one): released when that view unmounts.
    const { player: shown } = store.acquire(video('c'), SOURCE);
    store.attach(shown);
    store.acquire(video('d'), SOURCE);
    expect(mock(shown).pause).toHaveBeenCalled();
    expect(mock(shown).release).not.toHaveBeenCalled();
    store.detach(shown);
    expect(store.getSnapshot()?.media.key).toBe('video:d');
    await tick();
    expect(mock(shown).release).toHaveBeenCalledTimes(1);
  });

  it('claim stops other media but keeps the same media playing', () => {
    const store = new PlaybackStore();
    const { player } = store.acquire(video('a'), SOURCE);
    store.attach(player);
    store.minimize();

    store.claim('video', 'a');
    expect(store.getSnapshot()?.player).toBe(player);

    store.claim('live', 'a');
    expect(store.getSnapshot()).toBeNull();
    expect(mock(player).pause).toHaveBeenCalled();
    store.claim('video', 'b'); // nothing to stop
  });

  it('close stops and drops the session; releasing twice is guarded', async () => {
    const store = new PlaybackStore();
    store.close(); // nothing playing
    const { player } = store.acquire(video('a'), SOURCE);
    store.attach(player);
    store.minimize();
    store.detach(player);

    store.close();
    expect(store.getSnapshot()).toBeNull();
    expect(mock(player).pause).toHaveBeenCalled();
    expect(mock(player).release).toHaveBeenCalledTimes(1);

    // A stray detach for the released player doesn't release it again.
    store.attach(player);
    store.detach(player);
    await tick();
    expect(mock(player).release).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes listeners', () => {
    const store = new PlaybackStore();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.attach(store.acquire(video('a'), SOURCE).player);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('PlaybackProvider + hooks', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const wrapper = ({ children }: { children: ReactNode }) => <PlaybackProvider>{children}</PlaybackProvider>;

  it('shares one session between player views and observers', async () => {
    const { result } = await renderHook(
      () => ({ session: usePlaybackSession(), acquired: useSessionPlayer(SOURCE, jest.fn(), video('a')), store: usePlaybackStore() }),
      { wrapper },
    );
    expect(result.current.acquired.reused).toBe(false);
    expect(result.current.session).toMatchObject({ media: video('a'), player: result.current.acquired.player });

    await act(async () => result.current.store?.minimize());
    expect(result.current.session?.minimized).toBe(true);
  });

  it('stops playback when it turns inactive (sign-out)', async () => {
    let active = true;
    const { result, rerender } = await renderHook(() => ({ session: usePlaybackSession(), store: usePlaybackStore() }), {
      wrapper: ({ children }: { children: ReactNode }) => <PlaybackProvider active={active}>{children}</PlaybackProvider>,
    });
    const store = result.current.store as PlaybackStore;
    const { player } = store.acquire(video('a'), SOURCE);
    await act(async () => store.attach(player));
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
    const { result } = await renderHook(() => ({ acquired: useSessionPlayer(SOURCE, jest.fn()), session: usePlaybackSession() }), {
      wrapper,
    });
    expect(result.current.acquired.reused).toBe(false);
    expect(result.current.session).toBeNull();
  });
});
