/** Speeds offered in the speed menu (same as the TV app; AVPlayer only guarantees audio up to 2×). */
export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/** Speed while the video is pressed and held. */
export const HOLD_PLAYBACK_RATE = 2;

/** Seconds skipped by the skip buttons and by double-tapping a side of the video. */
export const SEEK_STEP_SECONDS = 15;

/** Controls hide after this long without interaction while playing. */
export const CONTROLS_HIDE_MS = 3000;
