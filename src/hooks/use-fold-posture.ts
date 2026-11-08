import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { addFoldPostureListener, getFoldPosture, type NativeFoldPosture } from '@modules/fold-posture';

/** Tabletop ("flex mode") split: the screen above the hinge and the one below it, in window dp. */
export interface TabletopLayout {
  /** Where the hinge starts: the top half spans 0…hingeTop. */
  hingeTop: number;
  /** Where the hinge ends: the bottom half spans hingeBottom…window height. */
  hingeBottom: number;
}

/** The device's hinge posture, live (null on devices without a fold). */
export function useFoldPosture(): NativeFoldPosture | null {
  const [posture, setPosture] = useState<NativeFoldPosture | null>(getFoldPosture);
  useEffect(() => {
    const subscription = addFoldPostureListener(setPosture);
    // The native side may have seen a change between the initial read and subscribing.
    setPosture(getFoldPosture());
    return () => subscription.remove();
  }, []);
  return posture;
}

/**
 * The tabletop split for a half-opened fold whose hinge runs across the window (horizontal), or
 * null. Android reports the hinge's exact bounds. iOS reports only that it is partially open, so
 * the hinge is assumed to cross the middle of the window's longer side — the iPhone Duo's inner
 * panel (2007×2853) folds into two near-4:3 halves — i.e. tabletop whenever the window is portrait.
 */
export function tabletopLayout(posture: NativeFoldPosture | null, window: { width: number; height: number }): TabletopLayout | null {
  if (posture?.state !== 'halfOpened') return null;
  const { bounds, orientation } = posture;
  if (!bounds || !orientation) {
    if (window.height <= window.width) return null;
    const middle = Math.round(window.height / 2);
    return { hingeTop: middle, hingeBottom: middle };
  }
  if (orientation !== 'horizontal') return null;
  const hingeTop = bounds.y;
  const hingeBottom = bounds.y + bounds.height;
  // A hinge outside the window (the app isn't spanning it) can't split the layout.
  if (hingeTop <= 0 || hingeBottom >= window.height) return null;
  return { hingeTop, hingeBottom };
}

/** The live tabletop split for the current window, or null when the device isn't in tabletop posture. */
export function useTabletopLayout(): TabletopLayout | null {
  const posture = useFoldPosture();
  const window = useWindowDimensions();
  return tabletopLayout(posture, window);
}
