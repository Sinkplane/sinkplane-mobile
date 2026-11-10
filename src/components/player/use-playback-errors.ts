import { useEffect, useEffectEvent } from 'react';
import type { VideoPlayer, VideoSource } from 'expo-video';

import type { PlaybackState } from '@/components/player/use-playback-state';

interface PlaybackErrorOptions {
  state: Pick<PlaybackState, 'status' | 'error'>;
  fullscreen: boolean;
  onFullscreenChange: (fullscreen: boolean) => void;
  onError?: ((message: string | undefined) => void) | undefined;
  onRetry?: (() => void) | undefined;
}

/**
 * Reacts to playback errors: leaves fullscreen (the error overlay replaces the controls, incl. the
 * exit-fullscreen button, so don't strand the user there) and reports the error. Returns the
 * overlay's Retry action: `onRetry`, or else reloading the original source.
 */
export function usePlaybackErrors(
  player: VideoPlayer,
  initialSource: VideoSource,
  { state, fullscreen, onFullscreenChange, onError, onRetry }: PlaybackErrorOptions,
): () => void {
  const { status } = state;
  useEffect(() => {
    if (status === 'error' && fullscreen) {
      onFullscreenChange(false);
    }
  }, [status, fullscreen, onFullscreenChange]);

  const reportError = useEffectEvent((message: string | undefined) => {
    onError?.(message);
  });
  const message = state.error?.message;
  useEffect(() => {
    if (status === 'error') {
      reportError(message);
    }
  }, [status, message]);

  return (
    onRetry ??
    (() => {
      player
        .replaceAsync(initialSource)
        .then(() => {
          player.play();
        })
        .catch(() => undefined);
    })
  );
}
