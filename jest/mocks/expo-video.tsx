/**
 * In-memory stand-in for expo-video (mapped in jest.config.base.js).
 *
 * `useVideoPlayer` / `createVideoPlayer` create a `MockVideoPlayer`: a plain object with writable state
 * (playing/status/currentTime/duration/playbackRate/…), jest.fn controls (play/pause/replay/seekBy)
 * and a small emitter compatible with `useEvent`/`useEventListener` from 'expo' — those hooks
 * subscribe with `addListener(eventName, cb)` and unsubscribe through the returned `{ remove }`.
 *
 * Tests grab players through `mockVideoPlayerState` (reset per test by jest/setup.unit.ts and
 * __tests__/e2e/helpers/runtime.ts), drive them with `emit(...)`/`setStatus(...)`, and assert
 * seeks recorded by the `currentTime` setter.
 */
import { useState } from 'react';
import { View, type ViewProps } from 'react-native';
import type { VideoSource } from 'expo-video';

export type MockVideoPlayerStatus = 'idle' | 'loading' | 'readyToPlay' | 'error';

type EventListener = (payload?: unknown) => void;

export interface MockVideoPlayer {
  /** The source the player was created with. */
  readonly source: VideoSource | string | null;
  playing: boolean;
  status: MockVideoPlayerStatus;
  currentTime: number;
  duration: number;
  playbackRate: number;
  timeUpdateEventInterval: number;
  staysActiveInBackground: boolean;
  showNowPlayingNotification: boolean;
  bufferedPosition: number;
  loop: boolean;
  muted: boolean;
  volume: number;
  /** Every value assigned to `currentTime`, in assignment order (seeks the app performed). */
  readonly seeks: number[];
  play: jest.Mock;
  pause: jest.Mock;
  replay: jest.Mock;
  seekBy: jest.Mock;
  replaceAsync: jest.Mock;
  /** Frees the native player; `released` records it. */
  release: jest.Mock;
  released: boolean;
  addListener: (eventName: string, listener: EventListener) => { remove: () => void };
  /** Deliver an event to every listener subscribed through `addListener`. */
  emit: (eventName: string, payload?: unknown) => void;
  /** Set `status` and emit the matching `statusChange` event. */
  setStatus: (status: MockVideoPlayerStatus) => void;
}

/** Create a standalone fake player (also what `useVideoPlayer` constructs). */
export function createMockVideoPlayer(
  source: VideoSource | string | null = null,
  setup?: (instance: MockVideoPlayer) => void,
): MockVideoPlayer {
  const listeners = new Map<string, Set<EventListener>>();

  const player: MockVideoPlayer = {
    source,
    playing: false,
    status: 'idle',
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
    timeUpdateEventInterval: 0,
    staysActiveInBackground: false,
    showNowPlayingNotification: false,
    bufferedPosition: 0,
    loop: false,
    muted: false,
    volume: 1,
    seeks: [],
    play: jest.fn(),
    pause: jest.fn(),
    replay: jest.fn(),
    seekBy: jest.fn((seconds: number) => {
      player.currentTime = player.currentTime + seconds;
    }),
    replaceAsync: jest.fn(async () => undefined),
    release: jest.fn(() => {
      player.released = true;
    }),
    released: false,
    addListener: (eventName: string, listener: EventListener) => {
      const set = listeners.get(eventName) ?? new Set<EventListener>();
      set.add(listener);
      listeners.set(eventName, set);
      return { remove: () => set.delete(listener) };
    },
    emit: (eventName: string, payload?: unknown) => {
      for (const listener of listeners.get(eventName) ?? []) listener(payload);
    },
    setStatus: (status: MockVideoPlayerStatus) => {
      player.status = status;
      player.emit('statusChange', { status });
    },
  };

  // Setting currentTime seeks (the app assigns it); record every seek.
  let currentTime = 0;
  Object.defineProperty(player, 'currentTime', {
    configurable: true,
    get: () => currentTime,
    set: (seconds: number) => {
      currentTime = seconds;
      player.seeks.push(seconds);
    },
  });

  player.play.mockImplementation(() => setPlaying(player, true));
  player.pause.mockImplementation(() => setPlaying(player, false));
  player.replay.mockImplementation(() => {
    player.currentTime = 0;
    setPlaying(player, true);
  });

  setup?.(player);
  return player;
}

function setPlaying(target: MockVideoPlayer, playing: boolean) {
  target.playing = playing;
  target.emit('playingChange', { isPlaying: playing });
}

/** Props the app passes to `VideoView` (callbacks the tests can invoke). */
export interface MockVideoViewProps extends ViewProps {
  player?: MockVideoPlayer | null;
  onPictureInPictureStart?: () => void;
  onPictureInPictureStop?: () => void;
}

/** Render-state the tests can inspect (the most recent `VideoView` mount's props). */
export const mockVideoPlayerState = {
  /** Every player `useVideoPlayer` / `createVideoPlayer` created, oldest first. */
  players: [] as MockVideoPlayer[],
  viewProps: null as MockVideoViewProps | null,
  /** The latest props of each mounted `VideoView`, by testID (the page player vs the mini player). */
  viewsByTestID: new Map<string, MockVideoViewProps>(),
  /** The most recently created player. */
  lastPlayer(): MockVideoPlayer {
    const player = this.players.at(-1);
    if (!player) throw new Error('No mock video player has been created yet');
    return player;
  },
};

/** Clear the recorded players/view (called between tests by each suite's setup). */
export function resetMockVideoPlayerState(): void {
  mockVideoPlayerState.players.length = 0;
  mockVideoPlayerState.viewProps = null;
  mockVideoPlayerState.viewsByTestID.clear();
}

/** The fake hook: one player per mount, kept stable across renders like the real one. */
export function useVideoPlayer(source: VideoSource | string | number | null, setup?: (instance: MockVideoPlayer) => void): MockVideoPlayer {
  const [player] = useState(() => {
    const created = createMockVideoPlayer(source ?? null, setup);
    mockVideoPlayerState.players.push(created);
    return created;
  });
  return player;
}

/** The unmanaged factory (the app's playback session owns and releases these players). */
export function createVideoPlayer(source: VideoSource | string | number | null): MockVideoPlayer {
  const created = createMockVideoPlayer(source ?? null);
  mockVideoPlayerState.players.push(created);
  return created;
}

/** The fake view: a host View that forwards props (testID, PiP callbacks) for tests to drive. */
export function VideoView(props: MockVideoViewProps) {
  mockVideoPlayerState.viewProps = props;
  if (props.testID) mockVideoPlayerState.viewsByTestID.set(props.testID, props);
  const rest = { ...props } as Partial<MockVideoViewProps> & ViewProps;
  delete rest.player; // the real view passes a player id, not the object
  return <View {...rest} />;
}
