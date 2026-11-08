import type { ReactNode } from 'react';
import type { VideoPlayer } from 'expo-video';
import { act, renderHook } from '@testing-library/react-native';
import { createMockVideoPlayer, mockVideoPlayerState, type MockVideoPlayer } from '@test/mocks/expo-video';

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

/** Run the retire `acquire` queues for a replaced player. */
const flushMicrotasks = () => act(async () => {});

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

    // Opening another video while the mini player plays: released right after the (render-time) acquire.
    store.acquire(video('b'), SOURCE);
    expect(mock(minimized).pause).not.toHaveBeenCalled();
    await flushMicrotasks();
    expect(mock(minimized).pause).toHaveBeenCalled();
    expect(mock(minimized).release).toHaveBeenCalledTimes(1);

    // Replaced while still on screen (a page under the new one): released when that view unmounts.
    const { player: shown } = store.acquire(video('c'), SOURCE);
    store.attach(shown);
    store.acquire(video('d'), SOURCE);
    await flushMicrotasks();
    expect(mock(shown).pause).toHaveBeenCalled();
    expect(mock(shown).release).not.toHaveBeenCalled();
    store.detach(shown);
    expect(store.getSnapshot()?.media.key).toBe('video:d');
    await tick();
    expect(mock(shown).release).toHaveBeenCalledTimes(1);
  });

  it('a replaced session whose page is still mounted is suspended, and returns when the new one ends', async () => {
    const store = new PlaybackStore();
    const { player: a } = store.acquire(video('a'), SOURCE);
    store.attach(a);

    // Video B opens on top of A's page (a notification): A pauses, but its page can take it back.
    const { player: b } = store.acquire(video('b'), SOURCE);
    await flushMicrotasks();
    expect(mock(a).pause).toHaveBeenCalledTimes(1);
    expect(mock(a).release).not.toHaveBeenCalled();
    store.attach(b);

    // B's page unmounts without minimizing: A becomes the session again, unpaused by nobody.
    store.detach(b);
    expect(store.getSnapshot()).toMatchObject({ media: video('a'), player: a, minimized: false });
    await tick();
    expect(mock(a).release).not.toHaveBeenCalled();
    expect(mock(b).release).toHaveBeenCalledTimes(1);
  });

  it('restores the most recent still-mounted suspended page; one whose page unmounts is released', async () => {
    const store = new PlaybackStore();
    const { player: a } = store.acquire(video('a'), SOURCE);
    store.attach(a);
    const { player: b } = store.acquire(video('b'), SOURCE);
    store.attach(b);
    const { player: c } = store.acquire(video('c'), SOURCE);
    store.attach(c);
    await flushMicrotasks();
    expect(mock(a).pause).toHaveBeenCalled();
    expect(mock(b).pause).toHaveBeenCalled();

    // A's page unmounts while suspended: its player is released, and it can never come back.
    store.detach(a);
    expect(store.getSnapshot()?.media.key).toBe('video:c');
    await tick();
    expect(mock(a).release).toHaveBeenCalledTimes(1);

    // C's page unmounts without minimizing: the most recent page still mounted (B) returns.
    store.detach(c);
    expect(store.getSnapshot()).toMatchObject({ media: video('b'), player: b });
  });

  it('does not restore a suspended page when the current session is minimized away', async () => {
    const store = new PlaybackStore();
    const { player: a } = store.acquire(video('a'), SOURCE);
    store.attach(a);
    const { player: b } = store.acquire(video('b'), SOURCE);
    store.attach(b);
    await flushMicrotasks();

    // B's close arrow: the tile takes B, and A's page underneath stays suspended (paused).
    store.minimize();
    store.detach(b);
    expect(store.getSnapshot()).toMatchObject({ media: video('b'), player: b, minimized: true });
    await tick();
    expect(mock(a).release).not.toHaveBeenCalled();
    expect(mock(b).release).not.toHaveBeenCalled();
  });

  it('close (the tile ✕ / sign-out) drops the session without resurrecting a suspended page', async () => {
    const store = new PlaybackStore();
    const { player: a } = store.acquire(video('a'), SOURCE);
    store.attach(a);
    const { player: b } = store.acquire(video('b'), SOURCE);
    store.attach(b);
    await flushMicrotasks();

    store.close();
    expect(store.getSnapshot()).toBeNull();

    // The pages unmount (sign-out resets the navigator): everything is released, nothing restored.
    store.detach(b);
    expect(store.getSnapshot()).toBeNull();
    store.detach(a);
    expect(store.getSnapshot()).toBeNull();
    await tick();
    expect(mock(a).release).toHaveBeenCalledTimes(1);
    expect(mock(b).release).toHaveBeenCalledTimes(1);
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

  it('unclaim hands the covered page its suspended session back when the closing page never got a player', async () => {
    const store = new PlaybackStore();
    const { player: a } = store.acquire(video('a'), SOURCE);
    store.attach(a);

    // A page for another video opens on top (its claim) but never reaches a player: A suspends.
    store.claim('video', 'b');
    expect(store.getSnapshot()).toBeNull();
    expect(mock(a).pause).toHaveBeenCalledTimes(1);
    expect(mock(a).release).not.toHaveBeenCalled();

    // …and closes again (its claim cleanup): A's still-mounted page takes its session back.
    const listener = jest.fn();
    store.subscribe(listener);
    store.unclaim();
    expect(store.getSnapshot()).toMatchObject({ media: video('a'), player: a, minimized: false });
    expect(listener).toHaveBeenCalledTimes(1);
    await tick();
    expect(mock(a).release).not.toHaveBeenCalled();
  });

  it('unclaim restores the most recent still-attached suspended session', async () => {
    const store = new PlaybackStore();
    const { player: a } = store.acquire(video('a'), SOURCE);
    store.attach(a);
    const { player: b } = store.acquire(video('b'), SOURCE);
    store.attach(b);
    await flushMicrotasks();

    // C's page claims on top of both but never gets a player, then closes: B (the newest page
    // still mounted) returns, while A keeps waiting underneath it.
    store.claim('video', 'c');
    store.unclaim();
    expect(store.getSnapshot()).toMatchObject({ media: video('b'), player: b, minimized: false });
    await tick();
    expect(mock(a).release).not.toHaveBeenCalled();

    // When B's page closes in turn, A is next.
    store.detach(b);
    expect(store.getSnapshot()).toMatchObject({ media: video('a'), player: a, minimized: false });
  });

  it('unclaim is a no-op while a session exists (a minimized tile keeps its player)', async () => {
    const store = new PlaybackStore();
    const { player } = store.acquire(video('a'), SOURCE);
    store.attach(player);
    store.minimize();
    store.detach(player);
    const listener = jest.fn();
    store.subscribe(listener);

    store.unclaim();
    expect(store.getSnapshot()).toMatchObject({ media: video('a'), player, minimized: true });
    expect(listener).not.toHaveBeenCalled();
  });

  it('unclaim with no session and nothing suspended leaves it null', () => {
    const store = new PlaybackStore();
    store.unclaim();
    expect(store.getSnapshot()).toBeNull();
  });

  it('isCurrent is true only for the session player, never a suspended or a retired one', async () => {
    const store = new PlaybackStore();
    expect(store.isCurrent(createMockVideoPlayer() as unknown as VideoPlayer)).toBe(false); // no session

    const { player: a } = store.acquire(video('a'), SOURCE);
    store.attach(a);
    expect(store.isCurrent(a)).toBe(true);

    // Replaced while still on screen (its page is mounted underneath): suspended, not current.
    const { player: b } = store.acquire(video('b'), SOURCE);
    await flushMicrotasks();
    store.attach(b);
    expect(store.isCurrent(a)).toBe(false);
    expect(store.isCurrent(b)).toBe(true);

    // Once the session ends, nobody is current.
    store.close();
    expect(store.isCurrent(b)).toBe(false);
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

  it('a view that never attached still releases its player when it unmounts (stray detach)', async () => {
    const store = new PlaybackStore();
    const { player } = store.acquire(video('a'), SOURCE);

    // A detach with no matching attach (a defensive race): no view count, just end the session.
    store.detach(player);
    expect(store.getSnapshot()).toBeNull();
    await tick();
    expect(mock(player).release).toHaveBeenCalledTimes(1);

    // The ended session starts over with a fresh player.
    expect(store.acquire(video('a'), SOURCE).reused).toBe(false);
  });

  it('a second deferred release of the same player finds no view record and stays guarded', async () => {
    const store = new PlaybackStore();
    const { player } = store.acquire(video('a'), SOURCE);
    store.attach(player);
    store.attach(player);

    // The page unmounts (ending the session) and an effect re-run attaches and detaches again,
    // so two deferred releases end up queued for the same player.
    store.detach(player); // one view left: nothing to do
    store.detach(player); // last view gone, session ends: deferred release queued
    store.attach(player); // the re-run re-attaches the same view…
    store.detach(player); // …and unmounts again: a second deferred release queued
    await tick(); // the first releases the player; the second finds no view record: still guarded

    expect(mock(player).release).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBeNull();
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

  it('useSessionPlayer tells its view whether its player is the session’s', async () => {
    const { result } = await renderHook(() => ({ acquired: useSessionPlayer(SOURCE, jest.fn(), video('a')), store: usePlaybackStore() }), {
      wrapper,
    });
    const { player } = result.current.acquired;
    expect(result.current.acquired.isCurrent()).toBe(true);

    // Another page's playback replaces the session: this view's player is suspended, not current.
    await act(async () => result.current.store?.acquire(video('b'), SOURCE));
    await flushMicrotasks();
    expect(result.current.acquired.isCurrent()).toBe(false);
    expect(mock(player).pause).toHaveBeenCalled();
  });
});
