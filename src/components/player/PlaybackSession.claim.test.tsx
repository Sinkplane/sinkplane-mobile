import type { VideoPlayer } from 'expo-video';
import { act } from '@testing-library/react-native';
import { createMockVideoPlayer, type MockVideoPlayer } from '@test/mocks/expo-video';

import { PlaybackStore, type PlaybackMedia } from '@/components/player/PlaybackSession';

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

describe('PlaybackStore claims and release guards', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
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

  it('unclaim is a no-op while a session exists (a minimized tile keeps its player)', () => {
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
