import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import { useEventListener } from 'expo';
import type { VideoPlayer } from 'expo-video';

/** Save while playing whenever the position moved this far from the last save (TV app parity). */
export const PROGRESS_SAVE_INTERVAL = 15;
/** Smaller moves aren't worth a request on pause / exit. */
const MIN_PROGRESS_DELTA = 2;
/** A position this close to 0 means a resume seek was dropped (the stream wasn't seekable yet). */
const DROPPED_SEEK_POSITION = 2;
/** The resume seek counts as landed once the player is within this many seconds of the target. */
const SEEK_TOLERANCE = 1;

/**
 * Players whose resume (seek + autoplay) already ran. A player outlives its view (mini player), so
 * a view taking over a started player must not seek or autoplay again, while one taking over a
 * player that was still loading must finish the resume the previous view never got to.
 */
const startedPlayers = new WeakSet<VideoPlayer>();

export interface WatchProgressOptions {
  /** Where to resume, in seconds (nothing to resume: start at 0). */
  initialTime?: number | undefined;
  /** Reports the watch position (live streams pass none: they only need the autoplay). */
  save?: ((seconds: number) => void) | undefined;
  /** False while another playback owns the session; the resume then only seeks. */
  canAutoplay?: (() => boolean) | undefined;
}

/** Seeks the player. expo-video seeks by assigning `currentTime` (a setter on the native object). */
function seek(player: VideoPlayer, seconds: number): void {
  Object.assign(player, { currentTime: seconds });
}

const alwaysAutoplay = (): boolean => true;

/** The resume seek, tracked until the player has actually arrived there. */
interface ResumeSeek {
  /** Resume target until the player has actually arrived there. */
  pending: RefObject<number | null>;
  start: (target: number) => void;
  /** False while the resume seek hasn't landed yet (the player still reports ~0 meanwhile). */
  settled: (currentTime: number) => boolean;
}

function useResumeSeek(player: VideoPlayer): ResumeSeek {
  const pending = useRef<number | null>(null);

  const start = (target: number) => {
    pending.current = target;
    seek(player, target);
  };

  const settled = (currentTime: number) => {
    const target = pending.current;
    if (target === null) {
      return true;
    }
    if (currentTime >= target - SEEK_TOLERANCE) {
      pending.current = null;
      return true;
    }
    // A seek issued before the stream was seekable can be dropped; retry it (the TV app does too).
    if (currentTime < DROPPED_SEEK_POSITION) {
      seek(player, target);
    }
    return false;
  };

  return { pending, start, settled };
}

interface Resume extends ResumeSeek {
  /** The resume ran (it may still be seeking). */
  resumed: RefObject<boolean>;
}

/** Seek + autoplay once the source is ready, unless another view already started this player. */
function useResume(
  player: VideoPlayer,
  started: boolean,
  { initialTime, canAutoplay = alwaysAutoplay }: WatchProgressOptions,
): Resume {
  const resumed = useRef(started);
  const resumeSeek = useResumeSeek(player);

  const resume = () => {
    if (resumed.current) {
      return;
    }
    resumed.current = true;
    startedPlayers.add(player);
    if (initialTime !== undefined && initialTime > 0) {
      resumeSeek.start(initialTime);
    }
    if (canAutoplay()) {
      player.play();
    }
  };

  // Only the state at mount matters; later transitions arrive through the listener below.
  const resumeIfReady = useEffectEvent(() => {
    if (player.status === 'readyToPlay') {
      resume();
    }
  });
  useEffect(() => {
    resumeIfReady();
  }, [player]);

  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay') {
      resume();
    }
  });

  return { resumed, ...resumeSeek };
}

interface ProgressSaver {
  /** The last position worth keeping (the player's own may be gone at unmount). */
  positionRef: RefObject<number>;
  /** Reports a position through the latest `save`, skipping moves smaller than `minDelta`. */
  saveIfMoved: (seconds: number, minDelta: number) => void;
}

/** Saves through the latest `save`; a final save of `position` runs on unmount. */
function useProgressSaver(
  save: WatchProgressOptions['save'],
  initialPosition: number,
): ProgressSaver {
  const positionRef = useRef(initialPosition);
  const lastSaved = useRef(initialPosition);
  const saveRef = useRef(save);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const saveIfMoved = (seconds: number, minDelta: number) => {
    if (Math.abs(seconds - lastSaved.current) < minDelta) {
      return;
    }
    lastSaved.current = seconds;
    saveRef.current?.(seconds);
  };

  // The native player may already be released when this cleanup runs, so use the last reported time.
  useEffect(
    () => () => {
      saveIfMoved(positionRef.current, MIN_PROGRESS_DELTA);
    },
    [],
  );

  return { positionRef, saveIfMoved };
}

/**
 * Starts playback once the source is ready, resuming at `initialTime`, and reports the watch position
 * through `save` periodically while playing, on pause, and when the player unmounts (live streams
 * pass no `save`: they only need the autoplay). Taking over a player another view already started
 * (the mini player, or its page reopened) skips the seek and autoplay and just keeps saving.
 * `canAutoplay`: false while another playback owns the session (this page is covered by another
 * player page); the resume then only seeks, leaving the player paused like any interrupted one.
 */
export function useWatchProgress(player: VideoPlayer, options: WatchProgressOptions = {}): void {
  const [started] = useState(() => startedPlayers.has(player));
  const initialPosition = started ? player.currentTime : (options.initialTime ?? 0);
  const { positionRef, saveIfMoved } = useProgressSaver(options.save, initialPosition);
  const { resumed, pending, settled } = useResume(player, started, options);

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    // Before the resume seek lands the player reports 0; don't overwrite the saved position with it.
    if (!resumed.current || !settled(currentTime)) {
      return;
    }
    positionRef.current = currentTime;
    if (player.playing) {
      saveIfMoved(currentTime, PROGRESS_SAVE_INTERVAL);
    }
  });

  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    if (!isPlaying && resumed.current && pending.current === null) {
      saveIfMoved(positionRef.current, MIN_PROGRESS_DELTA);
    }
  });
}
