import { useEffect, useRef } from 'react';
import { useEventListener } from 'expo';
import type { VideoPlayer } from 'expo-video';

/** Save while playing whenever the position moved this far from the last save (TV app parity). */
export const PROGRESS_SAVE_INTERVAL = 15;
/** Smaller moves aren't worth a request on pause / exit. */
const MIN_PROGRESS_DELTA = 2;

/**
 * Starts playback once the source is ready, resuming at `initialTime`, and reports the watch position
 * through `save` periodically while playing, on pause, and when the player unmounts (live streams
 * pass no `save`: they only need the autoplay). `started`: the player is already running (taken
 * over from another view, e.g. the mini player), so don't seek or autoplay; just keep saving.
 */
export function useWatchProgress(
  player: VideoPlayer,
  initialTime: number | undefined,
  save: ((seconds: number) => void) | undefined,
  started = false,
) {
  const lastSaved = useRef(started ? player.currentTime : (initialTime ?? 0));
  const position = useRef(started ? player.currentTime : (initialTime ?? 0));
  const resumed = useRef(started);
  /** Resume target until the player has actually arrived there. */
  const pendingSeek = useRef<number | null>(null);
  const saveRef = useRef(save);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const saveIfMoved = (seconds: number, minDelta: number) => {
    if (Math.abs(seconds - lastSaved.current) < minDelta) return;
    lastSaved.current = seconds;
    saveRef.current?.(seconds);
  };

  const resume = () => {
    if (resumed.current) return;
    resumed.current = true;
    if (initialTime && initialTime > 0) {
      pendingSeek.current = initialTime;
      player.currentTime = initialTime;
    }
    player.play();
  };

  /** False while the resume seek hasn't landed yet (the player still reports ~0 meanwhile). */
  const settled = (currentTime: number) => {
    const target = pendingSeek.current;
    if (target === null) return true;
    if (currentTime >= target - 1) {
      pendingSeek.current = null;
      return true;
    }
    // A seek issued before the stream was seekable can be dropped; retry it (the TV app does too).
    if (currentTime < 2) player.currentTime = target;
    return false;
  };

  useEffect(() => {
    if (player.status === 'readyToPlay') resume();
    // Only the state at mount matters; later transitions arrive through the listener below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay') resume();
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    // Before the resume seek lands the player reports 0; don't overwrite the saved position with it.
    if (!resumed.current || !settled(currentTime)) return;
    position.current = currentTime;
    if (player.playing) saveIfMoved(currentTime, PROGRESS_SAVE_INTERVAL);
  });

  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    if (!isPlaying && resumed.current && pendingSeek.current === null) saveIfMoved(position.current, MIN_PROGRESS_DELTA);
  });

  // The native player may already be released when this cleanup runs, so use the last reported time.
  useEffect(() => () => saveIfMoved(position.current, MIN_PROGRESS_DELTA), []); // eslint-disable-line react-hooks/exhaustive-deps
}
