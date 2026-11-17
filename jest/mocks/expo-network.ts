/**
 * In-memory stand-in for `expo-network` (registered with `jest.mock` in the suites' setup files,
 * since the Jest configs map no module for it). Like the real module, `useNetworkState()` reports
 * nothing known before the first answer; tests drive it with `mockNetwork.set(...)` (mounted hooks
 * update) and `reset()` (per test) goes back to "unknown".
 */
import { useSyncExternalStore } from 'react';

export interface NetworkState {
  isConnected?: boolean;
  isInternetReachable?: boolean;
}

const UNKNOWN: NetworkState = {};
const listeners = new Set<() => void>();
let current: NetworkState = UNKNOWN;

export const mockNetwork = {
  set(state: NetworkState): void {
    current = { ...state };
    for (const listener of [...listeners]) {
      listener();
    }
  },
  /** Connected and reachable. */
  online(): void {
    mockNetwork.set({ isConnected: true, isInternetReachable: true });
  },
  /** No connection at all. */
  offline(): void {
    mockNetwork.set({ isConnected: false, isInternetReachable: false });
  },
  reset(): void {
    current = UNKNOWN;
    listeners.clear();
  },
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useNetworkState(): NetworkState {
  return useSyncExternalStore(subscribe, () => current);
}
