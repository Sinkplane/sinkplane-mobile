/**
 * In-memory stand-in for the local `@modules/fold-posture` native module (mapped in
 * jest.config.base.js). Tests set the hinge with `mockFoldPosture.set(...)`, which updates
 * `getFoldPosture()` and notifies every listener; `reset()` (per test) returns to "no fold".
 */
import type { NativeFoldPosture } from '../../modules/fold-posture';

export type { HingeBounds, NativeFoldPosture } from '../../modules/fold-posture';

type FoldPostureListener = (posture: NativeFoldPosture | null) => void;

const listeners = new Set<FoldPostureListener>();
let current: NativeFoldPosture | null = null;

export const mockFoldPosture = {
  set(posture: NativeFoldPosture | null): void {
    current = posture;
    for (const listener of [...listeners]) {
      listener(posture);
    }
  },
  listenerCount: (): number => listeners.size,
  reset(): void {
    current = null;
    listeners.clear();
  },
};

export function getFoldPosture(): NativeFoldPosture | null {
  return current;
}

export function addFoldPostureListener(listener: FoldPostureListener): { remove: () => boolean } {
  listeners.add(listener);
  return { remove: () => listeners.delete(listener) };
}
