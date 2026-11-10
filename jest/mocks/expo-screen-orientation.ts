/**
 * In-memory stand-in for expo-screen-orientation (mapped in jest.config.base.js).
 *
 * `lockAsync` records requested locks and resolves; the enums mirror the real package's values
 * (as const objects: the real member names are UPPER_CASE). Tests assert on `lockAsync` calls
 * (e.g. through the `orientation` handle on the E2E runtime) and rotate the device with
 * `emitOrientationChange`.
 */

export const OrientationLock = {
  DEFAULT: 0,
  ALL: 1,
  PORTRAIT: 2,
  PORTRAIT_UP: 3,
  PORTRAIT_DOWN: 4,
  LANDSCAPE: 5,
  LANDSCAPE_LEFT: 6,
  LANDSCAPE_RIGHT: 7,
  OTHER: 8,
  UNKNOWN: 9,
} as const;
export type OrientationLock = (typeof OrientationLock)[keyof typeof OrientationLock];

export const Orientation = {
  UNKNOWN: 0,
  PORTRAIT_UP: 1,
  PORTRAIT_DOWN: 2,
  LANDSCAPE_LEFT: 3,
  LANDSCAPE_RIGHT: 4,
} as const;
export type Orientation = (typeof Orientation)[keyof typeof Orientation];

export const SizeClassIOS = {
  REGULAR: 0,
  COMPACT: 1,
} as const;
export type SizeClassIOS = (typeof SizeClassIOS)[keyof typeof SizeClassIOS];

export const lockAsync = jest.fn((_orientationLock: OrientationLock): Promise<void> =>
  Promise.resolve(),
);
export const unlockAsync = jest.fn((): Promise<void> => Promise.resolve());
export const getOrientationAsync = jest.fn((): Promise<Orientation> =>
  Promise.resolve(Orientation.PORTRAIT_UP),
);
export const getOrientationLockAsync = jest.fn((): Promise<OrientationLock> =>
  Promise.resolve(OrientationLock.DEFAULT),
);
export const supportsOrientationLockAsync = jest.fn((): Promise<boolean> => Promise.resolve(true));

type OrientationChangeListener = (event: { orientationInfo: { orientation: Orientation } }) => void;
const orientationListeners = new Set<OrientationChangeListener>();

export const addOrientationChangeListener = jest.fn((listener: OrientationChangeListener) => {
  orientationListeners.add(listener);
  return { remove: () => orientationListeners.delete(listener) };
});
export const removeOrientationChangeListener = jest.fn();

/** Simulate the screen rotating: notifies every listener the app subscribed. */
export function emitOrientationChange(orientation: Orientation): void {
  orientationListeners.forEach((listener) => {
    listener({ orientationInfo: { orientation } });
  });
}

/** How many orientation listeners are currently subscribed. */
export function orientationListenerCount(): number {
  return orientationListeners.size;
}
