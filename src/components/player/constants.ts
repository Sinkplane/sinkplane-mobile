const SLOWEST_SPEED = 0.5;
const FASTEST_SPEED = 2;
const SPEED_STEP = 0.25;

/** Speeds offered in the speed menu (same as the TV app; AVPlayer only guarantees audio up to 2×). */
export const PLAYBACK_SPEEDS: readonly number[] = Array.from(
  { length: (FASTEST_SPEED - SLOWEST_SPEED) / SPEED_STEP + 1 },
  (_, index) => SLOWEST_SPEED + index * SPEED_STEP,
);

/** Speed while the video is pressed and held. */
export const HOLD_PLAYBACK_RATE = 2;

/** Seconds skipped by the skip buttons and by double-tapping a side of the video. */
export const SEEK_STEP_SECONDS = 15;

/** Controls hide after this long without interaction while playing. */
export const CONTROLS_HIDE_MS = 3000;
