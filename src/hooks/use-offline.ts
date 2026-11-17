import { useNetworkState } from 'expo-network';

import { useSession } from '@/shared';

/** Whether the OS reports a usable connection (unknown counts as connected). */
export function useNetworkAvailable(): boolean {
  const network = useNetworkState();
  return network.isConnected !== false && network.isInternetReachable !== false;
}

/**
 * No network right now, or the session couldn't be checked since launch (offline mode): Floatplane
 * can't be reached, so actions that need it (reactions, new downloads) are off.
 */
export function useIsOffline(): boolean {
  const { offline } = useSession();
  const available = useNetworkAvailable();
  return offline || !available;
}
