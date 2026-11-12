import { useState } from 'react';
import { useEvent, useEventListener } from 'expo';
import type { PlayerError, VideoPlayer, VideoPlayerStatus } from 'expo-video';

export interface PlaybackState {
  playing: boolean;
  ended: boolean;
  /** Play-throughs so far: tells one ending from the next (the end screen's dismissal is per ending). */
  endCount: number;
  status: VideoPlayerStatus;
  error: PlayerError | undefined;
  currentTime: number;
  bufferedPosition: number;
}

/** The player's state as React state: playing, ended, load status / error and position. */
export function usePlaybackState(player: VideoPlayer): PlaybackState {
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const time = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    bufferedPosition: 0,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
  });
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });
  const [ended, setEnded] = useState(false);
  const [endCount, setEndCount] = useState(0);

  useEventListener(player, 'playToEnd', () => {
    setEnded(true);
    setEndCount((count) => count + 1);
  });
  useEventListener(player, 'playingChange', ({ isPlaying: nowPlaying }) => {
    if (nowPlaying) {
      setEnded(false);
    }
  });

  return {
    playing: isPlaying,
    ended,
    endCount,
    status,
    error,
    currentTime: time.currentTime,
    bufferedPosition: time.bufferedPosition,
  };
}
