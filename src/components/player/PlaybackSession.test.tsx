import type { VideoPlayer } from 'expo-video';
import { act } from '@testing-library/react-native';
import { mockVideoPlayerState, type MockVideoPlayer } from '@test/mocks/expo-video';

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
});
