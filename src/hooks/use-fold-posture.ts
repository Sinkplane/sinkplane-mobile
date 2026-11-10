import { useSyncExternalStore } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  addFoldPostureListener,
  getFoldPosture,
  type HingeBounds,
  type NativeFoldPosture,
} from '@modules/fold-posture';

/** Without hinge geometry the fold is assumed to cross the middle of the window. */
const HALVES = 2;

/** Tabletop ("flex mode") split: the screen above the hinge and the one below it, in window dp. */
export interface TabletopLayout {
  /** Where the hinge starts: the top half spans 0…hingeTop. */
  hingeTop: number;
  /** Where the hinge ends: the bottom half spans hingeBottom…window height. */
  hingeBottom: number;
}

interface WindowSize {
  width: number;
  height: number;
}

/**
 * The native module hands out a fresh object per read; keep the previous one while nothing changed
 * so useSyncExternalStore sees a stable snapshot.
 */
let snapshot: NativeFoldPosture | null = null;

function readPosture(): NativeFoldPosture | null {
  const next = getFoldPosture();
  if (JSON.stringify(next) !== JSON.stringify(snapshot)) {
    snapshot = next;
  }
  return snapshot;
}

function subscribe(onChange: () => void): () => void {
  const subscription = addFoldPostureListener(onChange);
  return () => {
    subscription.remove();
  };
}

/**
 * The device's hinge posture, live (null on devices without a fold). React re-reads the posture
 * right after subscribing, which catches a change the native side saw in between.
 */
export function useFoldPosture(): NativeFoldPosture | null {
  return useSyncExternalStore(subscribe, readPosture);
}

/** iOS: no geometry, so a portrait window is assumed to fold across its middle. */
function assumedSplit(window: WindowSize): TabletopLayout | null {
  if (window.height <= window.width) {
    return null;
  }
  const middle = Math.round(window.height / HALVES);
  return { hingeTop: middle, hingeBottom: middle };
}

/** Android: the reported hinge, when it lies inside the window. */
function hingeSplit(bounds: HingeBounds, window: WindowSize): TabletopLayout | null {
  const hingeTop = bounds.y;
  const hingeBottom = bounds.y + bounds.height;
  // A hinge outside the window (the app isn't spanning it) can't split the layout.
  if (hingeTop <= 0 || hingeBottom >= window.height) {
    return null;
  }
  return { hingeTop, hingeBottom };
}

/**
 * The tabletop split for a half-opened fold whose hinge runs across the window (horizontal), or
 * null. Android reports the hinge's exact bounds. iOS reports only that it is partially open, so
 * the hinge is assumed to cross the middle of the window's longer side — the iPhone Duo's inner
 * panel (2007×2853) folds into two near-4:3 halves — i.e. tabletop whenever the window is portrait.
 */
export function tabletopLayout(
  posture: NativeFoldPosture | null,
  window: WindowSize,
): TabletopLayout | null {
  if (posture?.state !== 'halfOpened') {
    return null;
  }
  const { bounds, orientation } = posture;
  if (!bounds || orientation === undefined) {
    return assumedSplit(window);
  }
  return orientation === 'horizontal' ? hingeSplit(bounds, window) : null;
}

/** The live tabletop split for the current window, or null when the device isn't in tabletop posture. */
export function useTabletopLayout(): TabletopLayout | null {
  const posture = useFoldPosture();
  const window = useWindowDimensions();
  return tabletopLayout(posture, window);
}
