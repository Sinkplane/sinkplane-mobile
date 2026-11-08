/**
 * In-memory stand-in for expo-screen-orientation (mapped in jest.config.base.js).
 *
 * `lockAsync` records requested locks and resolves; the enums mirror the real package's values.
 * Tests assert on `lockAsync` calls (e.g. through the `orientation` handle on the E2E runtime) and
 * rotate the device with `emitOrientationChange`.
 */

export enum OrientationLock {
  DEFAULT = 0,
  ALL = 1,
  PORTRAIT = 2,
  PORTRAIT_UP = 3,
  PORTRAIT_DOWN = 4,
  LANDSCAPE = 5,
  LANDSCAPE_LEFT = 6,
  LANDSCAPE_RIGHT = 7,
  OTHER = 8,
  UNKNOWN = 9,
}

export enum Orientation {
  UNKNOWN = 0,
  PORTRAIT_UP = 1,
  PORTRAIT_DOWN = 2,
  LANDSCAPE_LEFT = 3,
  LANDSCAPE_RIGHT = 4,
}

export enum SizeClassIOS {
  REGULAR = 0,
  COMPACT = 1,
}

export const lockAsync = jest.fn(async (_orientationLock: OrientationLock): Promise<void> => undefined);
export const unlockAsync = jest.fn(async (): Promise<void> => undefined);
export const getOrientationAsync = jest.fn(async (): Promise<Orientation> => Orientation.PORTRAIT_UP);
export const getOrientationLockAsync = jest.fn(async (): Promise<OrientationLock> => OrientationLock.DEFAULT);
/**
 * Like a notched / Dynamic Island iPhone by default: no upside-down portrait, so ALL, PORTRAIT and
 * PORTRAIT_DOWN are unsupported (the real module rejects those locks). Override per test for a
 * device that can (`mockResolvedValue(true)`, e.g. the iPhone Duo).
 */
export const supportsOrientationLockAsync = jest.fn(
  async (lock: OrientationLock): Promise<boolean> =>
    lock !== OrientationLock.ALL && lock !== OrientationLock.PORTRAIT && lock !== OrientationLock.PORTRAIT_DOWN,
);

type OrientationChangeListener = (event: { orientationInfo: { orientation: Orientation } }) => void;
const orientationListeners = new Set<OrientationChangeListener>();

export const addOrientationChangeListener = jest.fn((listener: OrientationChangeListener) => {
  orientationListeners.add(listener);
  return { remove: () => orientationListeners.delete(listener) };
});
export const removeOrientationChangeListener = jest.fn();

/** Simulate the screen rotating: notifies every listener the app subscribed. */
export function emitOrientationChange(orientation: Orientation) {
  orientationListeners.forEach(listener => listener({ orientationInfo: { orientation } }));
}

/** How many orientation listeners are currently subscribed. */
export function orientationListenerCount() {
  return orientationListeners.size;
}
