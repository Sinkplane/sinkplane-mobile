/**
 * Window-size control shared by the unit and E2E suites (alias `@test/window-size`).
 *
 * The app sizes its layouts from `useWindowDimensions` (grid columns, tablet side-by-side, mini
 * player), which reads RN's `Dimensions.get('window')` and subscribes to its `change` event.
 * `Dimensions.set` is the same entry point the native `didUpdateDimensions` event uses, so driving
 * it updates every mounted `useWindowDimensions` hook exactly like a rotation / fold / split-screen
 * resize would — no `jest.mock` needed, and it works across a per-test module reset.
 *
 * `Dimensions` is a module singleton, so a size set here persists until the next call; each suite's
 * global setup calls `resetTestWindow()` to start every test on a phone.
 */
import { Dimensions, type DisplayMetrics } from 'react-native';

/** A phone-class window (iPhone 13/14-ish): too narrow to be a large screen in any orientation. */
export const PHONE_WINDOW = Object.freeze({ width: 390, height: 844 });

/** The same phone held sideways: wide, but the short side still keeps it out of large-screen territory. */
export const PHONE_LANDSCAPE_WINDOW = Object.freeze({ width: 844, height: 390 });

/**
 * An unfolded foldable's portrait window. Wide enough to count as a large screen while still
 * portrait — the size the foldable E2E suite has always effectively run at.
 */
export const LARGE_PORTRAIT_WINDOW = Object.freeze({ width: 750, height: 1334 });

/** iPad Pro / ~11-12" Android tablet, portrait. */
export const TABLET_PORTRAIT_WINDOW = Object.freeze({ width: 1024, height: 1366 });

/** iPad Pro 12.9" / ~12" Android tablet, landscape. */
export const TABLET_LANDSCAPE_WINDOW = Object.freeze({ width: 1366, height: 1024 });

const metrics = (size: { width: number; height: number }): DisplayMetrics => ({
  ...size,
  scale: 2,
  fontScale: 1,
});

/** Point `useWindowDimensions` at `size` and notify every subscriber (a rotation, fold, or resize). */
export function setTestWindow(size: { width: number; height: number }): void {
  Dimensions.set({ window: metrics(size) });
}

/** Back to the phone default, so one test's resize never leaks into the next. */
export function resetTestWindow(): void {
  setTestWindow(PHONE_WINDOW);
}
