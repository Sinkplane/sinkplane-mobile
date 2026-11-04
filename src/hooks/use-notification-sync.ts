import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { creatorNotificationSettingsKey } from '@/hooks/use-creator-notification-settings';
import { notificationsActive, useNotificationPreferences } from '@/hooks/use-notification-preferences';
import { cancelNewPostsCheck, scheduleNewPostsCheck } from '@/notifications/background-check';
import { parseCreatorNotification } from '@/notifications/creator-notification';
import { FloatplaneSocket } from '@/notifications/floatplane-socket';
import { notifyOnce, notificationRoute } from '@/notifications/local-notifications';
import { fetchNotificationSettings } from '@/notifications/notification-settings-api';
import { clearNotificationState, ensureSeenBaseline, markSeen, setBackgroundSession } from '@/notifications/notification-store';

export const CREATOR_NOTIFICATION_EVENT = 'creatorNotification';

function useAppIsActive(): boolean {
  const [active, setActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  return active;
}

/** The creator's "notify me" switch (Floatplane's contentFirebase); unknown creators default to on. */
async function creatorWantsNotifications(queryClient: QueryClient, token: string, creatorId: string | null): Promise<boolean> {
  if (!creatorId) return true;
  try {
    const settings = await queryClient.ensureQueryData({
      queryKey: creatorNotificationSettingsKey(token),
      queryFn: () => fetchNotificationSettings(token),
    });
    return settings.find(entry => entry.creatorId === creatorId)?.contentFirebase ?? true;
  } catch {
    return true;
  }
}

/**
 * Wires notifications to the session (mounted once, in the root navigator):
 *
 *  - Signed in with notifications on: holds the live sync socket open while the app is in the
 *    foreground and turns `creatorNotification` events into local notifications, and schedules the
 *    background check for when it isn't.
 *  - First signed-in launch: asks for permission (the answer becomes the in-app switch's value).
 *  - Mirrors the session token for the background check; sign-out clears it and stops the check.
 */
export function useNotificationSync(token: string | null | undefined, sessionLoading: boolean): void {
  const queryClient = useQueryClient();
  const { preferences, setEnabled } = useNotificationPreferences();
  const appActive = useAppIsActive();
  const active = !!token && notificationsActive(preferences);

  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // Session mirror for the background task; sign-out forgets it (and what was shown).
  useEffect(() => {
    if (token) void setBackgroundSession(token);
    else if (!sessionLoading) void Promise.all([clearNotificationState(), cancelNewPostsCheck()]).catch(() => undefined);
  }, [token, sessionLoading]);

  // First signed-in launch: ask once.
  const promptedRef = useRef(false);
  useEffect(() => {
    if (!token || preferences?.enabled !== null || promptedRef.current) return;
    promptedRef.current = true;
    void setEnabled(true).catch(() => undefined);
  }, [token, preferences?.enabled, setEnabled]);

  // Background check follows the switch.
  const enabled = preferences?.enabled;
  useEffect(() => {
    if (active) {
      void ensureSeenBaseline()
        .then(scheduleNewPostsCheck)
        .catch(error => console.error('[Notifications] Could not schedule the background check:', error));
    } else if (token && enabled === false) {
      void cancelNewPostsCheck().catch(() => undefined);
    }
  }, [active, token, enabled]);

  // Live notifications while the app is open.
  useEffect(() => {
    if (!active || !appActive || !token) return undefined;

    const handle = async (data: unknown) => {
      const notification = parseCreatorNotification(data);
      if (!notification) return;
      if (notification.postId) void queryClient.invalidateQueries({ queryKey: ['videos-infinite'] });
      if (!(await creatorWantsNotifications(queryClient, token, notification.creatorId))) return;
      // Already looking at it (floatplane.com does the same): just remember it was delivered.
      if (pathnameRef.current === notificationRoute(notification)) {
        await markSeen(notification.id);
        return;
      }
      await notifyOnce(notification);
    };

    const socket = new FloatplaneSocket({
      token,
      onSyncEvent: (event, data) => {
        if (event !== CREATOR_NOTIFICATION_EVENT) return;
        handle(data).catch(error => console.error('[Notifications] Could not show a notification:', error));
      },
    });
    socket.connect();
    return () => socket.close();
  }, [active, appActive, token, queryClient]);
}
