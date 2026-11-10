import type { VideoPlayer } from 'expo-video';

/** The player properties the app writes. */
type PlayerSettings = Partial<
  Pick<
    VideoPlayer,
    | 'currentTime'
    | 'playbackRate'
    | 'timeUpdateEventInterval'
    | 'staysActiveInBackground'
    | 'showNowPlayingNotification'
  >
>;

/**
 * Writes player properties. expo-video is driven by assigning them (setters on the native object:
 * `currentTime` seeks, `playbackRate` changes speed, …).
 */
export function applyPlayerSettings(player: VideoPlayer, settings: PlayerSettings): void {
  Object.assign(player, settings);
}
