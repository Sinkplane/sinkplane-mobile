import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createVideoPlayer, type VideoPlayer, type VideoSource } from 'expo-video';

/** What is playing: lets the mini player label it and reopen its page. */
export interface PlaybackMedia {
  /**
   * Identifies one playback. A player mounting with the key of the running session takes over its
   * native player (seamless, no reload); any other key replaces the session.
   */
  key: string;
  kind: 'video' | 'live';
  /** Post id (video) or creator id (live): the page the mini player reopens. */
  id: string;
  title?: string;
  /** Channel / creator name. */
  subtitle?: string;
}

export interface PlaybackSession {
  media: PlaybackMedia;
  player: VideoPlayer;
  /** Set by the player page's close arrow: the mini player takes over until the page reopens. */
  minimized: boolean;
}

/**
 * Owns the native video player across screens so playback survives leaving the player page (the
 * mini player). Players are created unmanaged (`createVideoPlayer`) and released here: when the
 * last view of a non-minimized player unmounts, when another playback replaces it, or on close.
 * Mutations made while rendering (`acquire`) don't notify; the mount effect (`attach`) does.
 */
export class PlaybackStore {
  private session: PlaybackSession | null = null;
  private readonly attachments = new Map<VideoPlayer, number>();
  private readonly released = new WeakSet<VideoPlayer>();
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.session;

  private setSession(session: PlaybackSession | null) {
    this.session = session;
    for (const listener of this.listeners) listener();
  }

  /** The session's player when `media.key` matches it (`reused`), else a new player replacing the session. */
  acquire(media: PlaybackMedia, source: VideoSource, setup?: (instance: VideoPlayer) => void) {
    if (this.session?.media.key === media.key) return { player: this.session.player, reused: true };
    // Called while rendering: pausing can synchronously notify the replaced player's still-mounted
    // view, which must not update state mid-render, so retire it right after.
    const replaced = this.session?.player;
    if (replaced) void Promise.resolve().then(() => this.retire(replaced));
    const player = createVideoPlayer(source);
    setup?.(player);
    this.session = { media, player, minimized: false };
    return { player, reused: false };
  }

  /** A view of `player` mounted. Mounting the session's player on its page ends the mini player. */
  attach(player: VideoPlayer) {
    this.attachments.set(player, (this.attachments.get(player) ?? 0) + 1);
    // Also publishes a session `acquire` created while rendering.
    if (this.session?.player === player) this.setSession({ ...this.session, minimized: false });
  }

  /** A view of `player` unmounted: release it once nothing shows it, unless the mini player took it. */
  detach(player: VideoPlayer) {
    const count = (this.attachments.get(player) ?? 1) - 1;
    this.attachments.set(player, count);
    if (count > 0) return;
    if (this.session?.player === player) {
      if (this.session.minimized) return;
      // Ended right away, so a later mount of the same media starts a fresh player.
      this.setSession(null);
    }
    // Released a tick later: an effect re-run (cleanup + setup) re-attaches the same view first.
    setTimeout(() => {
      if ((this.attachments.get(player) ?? 0) <= 0) this.release(player);
    }, 0);
  }

  /** Hand the session's player to the mini player (the page is about to close). */
  minimize() {
    if (this.session && !this.session.minimized) this.setSession({ ...this.session, minimized: true });
  }

  /** A player page opened for `kind`/`id`: stop any other playback right away. */
  claim(kind: PlaybackMedia['kind'], id: string) {
    const media = this.session?.media;
    if (media && (media.kind !== kind || media.id !== id)) this.close();
  }

  /** Stop and drop the session (mini player close, sign-out). */
  close() {
    const current = this.session;
    if (!current) return;
    this.retire(current.player);
    this.setSession(null);
  }

  /** Pause a player leaving the session; release it now unless a view still shows it (its detach will). */
  private retire(player: VideoPlayer) {
    player.pause();
    if ((this.attachments.get(player) ?? 0) <= 0) this.release(player);
  }

  private release(player: VideoPlayer) {
    this.attachments.delete(player);
    if (this.released.has(player)) return;
    this.released.add(player);
    player.release();
  }
}

const PlaybackContext = createContext<PlaybackStore | null>(null);

/** App-wide playback session (root layout). Stops playback when `active` turns false (sign-out). */
export function PlaybackProvider({ active = true, children }: { active?: boolean; children: ReactNode }) {
  const [store] = useState(() => new PlaybackStore());
  useEffect(() => {
    if (!active) store.close();
  }, [active, store]);
  return <PlaybackContext.Provider value={store}>{children}</PlaybackContext.Provider>;
}

/** The app's playback store, or null outside a `PlaybackProvider`. */
export function usePlaybackStore() {
  return useContext(PlaybackContext);
}

const noSession = () => null;
const noSubscription = () => () => {};

/** The current playback session (re-renders when it starts, stops, minimizes or restores). */
export function usePlaybackSession() {
  const store = usePlaybackStore();
  return useSyncExternalStore(store?.subscribe ?? noSubscription, store?.getSnapshot ?? noSession);
}

/**
 * The native player for a player view. With `media` inside a `PlaybackProvider` it comes from the
 * app session (reused when that playback is already running: `reused`); otherwise the view owns a
 * private one. Either way it is released once no view shows it.
 */
export function useSessionPlayer(source: VideoSource, setup: (instance: VideoPlayer) => void, media?: PlaybackMedia) {
  const appStore = usePlaybackStore();
  const [localStore] = useState(() => new PlaybackStore());
  const store = media && appStore ? appStore : localStore;
  const [acquired] = useState(() => store.acquire(media ?? { key: 'local', kind: 'video', id: '' }, source, setup));
  const { player } = acquired;

  useEffect(() => {
    store.attach(player);
    return () => store.detach(player);
  }, [store, player]);

  return acquired;
}
