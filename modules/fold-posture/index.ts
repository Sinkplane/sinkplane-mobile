import { requireOptionalNativeModule, type NativeModule } from 'expo';

/** Hinge geometry in window points / dp (React Native layout units). */
export interface HingeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The device's fold, as the native side reports it. `null` when there is none (regular phones,
 * a window that doesn't span the hinge, a folded-shut device).
 */
export interface NativeFoldPosture {
  /** `halfOpened`: partially folded (tabletop / book); `flat`: fully open. */
  state: 'flat' | 'halfOpened';
  /** Android only (Jetpack WindowManager); iOS reports no hinge geometry. */
  orientation?: 'horizontal' | 'vertical';
  /** Android only. */
  bounds?: HingeBounds;
  /** Android: whether the hinge splits the window into two logical areas. */
  isSeparating?: boolean;
  /** iOS: hinge angle in radians. */
  angle?: number;
}

// A type alias, not an interface: NativeModule's EventsMap constraint needs an index signature.
type FoldPostureEvents = Record<
  'onPostureChange',
  (event: { posture: NativeFoldPosture | null }) => void
>;

declare class FoldPostureModule extends NativeModule<FoldPostureEvents> {
  getPosture(): NativeFoldPosture | null;
}

// Optional: absent on web, in Jest, and in dev builds made before this module was added.
const native = requireOptionalNativeModule<FoldPostureModule>('FoldPosture');

/** The latest posture the native side has seen (null until the first listener attached). */
export function getFoldPosture(): NativeFoldPosture | null {
  return native?.getPosture() ?? null;
}

/** Subscribe to posture changes; the native side only tracks the hinge while someone listens. */
export function addFoldPostureListener(listener: (posture: NativeFoldPosture | null) => void): {
  remove: () => void;
} {
  if (!native) return { remove: () => undefined };
  return native.addListener('onPostureChange', ({ posture }) => {
    listener(posture);
  });
}
