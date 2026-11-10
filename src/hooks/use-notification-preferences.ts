import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getPermissionState,
  requestPermission,
  type PermissionState,
} from '@/notifications/local-notifications';
import {
  getNotificationsEnabled,
  resetSeenBaseline,
  setNotificationsEnabled,
} from '@/notifications/notification-store';

export interface NotificationPreferences {
  /** The in-app switch (null: never asked). */
  enabled: boolean | null;
  /** The OS permission. */
  permission: PermissionState;
}

const NOTIFICATION_PREFERENCES_KEY = ['notifications', 'preferences'] as const;

async function loadPreferences(): Promise<NotificationPreferences> {
  const [enabled, permission] = await Promise.all([
    getNotificationsEnabled(),
    getPermissionState(),
  ]);
  return { enabled, permission };
}

/** Notifications are actually on: the user wants them and the OS allows them. */
export const notificationsActive = (preferences: NotificationPreferences | undefined): boolean =>
  preferences?.enabled === true && preferences.permission === 'granted';

/**
 * The new-post notifications switch plus the OS permission behind it. Turning it on asks for the
 * permission when the OS still allows prompting; when the permission is refused the switch stays
 * off (the UI then points at system settings). Permission is re-read whenever the app returns to
 * the foreground, since it can be changed in system settings meanwhile. Switching it on restarts
 * the "new since" clock.
 */
export interface NotificationPreferencesState {
  preferences: NotificationPreferences | undefined;
  isLoading: boolean;
  isUpdating: boolean;
  setEnabled: (enable: boolean) => Promise<NotificationPreferences>;
}

export function useNotificationPreferences(): NotificationPreferencesState {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: NOTIFICATION_PREFERENCES_KEY,
    queryFn: loadPreferences,
    staleTime: Infinity,
  });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_KEY });
      }
    });
    return () => {
      subscription.remove();
    };
  }, [queryClient]);

  const mutation = useMutation({
    mutationFn: async (enable: boolean): Promise<NotificationPreferences> => {
      const permission = enable ? await requestPermission() : await getPermissionState();
      const enabled = enable && permission === 'granted';
      // Posts released while notifications were off aren't new.
      if (enabled) {
        await resetSeenBaseline();
      }
      await setNotificationsEnabled(enabled);
      return { enabled, permission };
    },
    onSuccess: (preferences) => queryClient.setQueryData(NOTIFICATION_PREFERENCES_KEY, preferences),
  });

  return {
    preferences: query.data,
    isLoading: query.isLoading,
    isUpdating: mutation.isPending,
    setEnabled: (enable: boolean) => mutation.mutateAsync(enable),
  };
}
