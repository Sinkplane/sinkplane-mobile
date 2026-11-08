/**
 * In-memory stand-in for the local `@modules/fold-posture` native module (mapped in
 * jest.config.base.js). Tests set the hinge with `mockFoldPosture.set(...)`, which updates
 * `getFoldPosture()` and notifies every listener; `reset()` (per test) returns to "no fold".
 */
import type { NativeFoldPosture } from '../../modules/fold-posture';

export type { HingeBounds, NativeFoldPosture } from '../../modules/fold-posture';

const listeners = new Set<(posture: NativeFoldPosture | null) => void>();
let current: NativeFoldPosture | null = null;

export const mockFoldPosture = {
  set(posture: NativeFoldPosture | null) {
    current = posture;
    for (const listener of [...listeners]) listener(posture);
  },
  listenerCount: () => listeners.size,
  reset() {
    current = null;
    listeners.clear();
  },
};

export function getFoldPosture(): NativeFoldPosture | null {
  return current;
}

export function addFoldPostureListener(listener: (posture: NativeFoldPosture | null) => void) {
  listeners.add(listener);
  return { remove: () => listeners.delete(listener) };
}
