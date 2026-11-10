import { logError } from '@/utils/log';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { creatorNotificationSettingsKey } from '@/hooks/use-creator-notification-settings';
import { isNonEmpty } from '@/hooks/is-non-empty';
import {
  notificationsActive,
  useNotificationPreferences,
} from '@/hooks/use-notification-preferences';
import { cancelNewPostsCheck, scheduleNewPostsCheck } from '@/notifications/background-check';
import { parseCreatorNotification } from '@/notifications/creator-notification';
import { FloatplaneSocket } from '@/notifications/floatplane-socket';
import { notifyOnce, notificationRoute } from '@/notifications/local-notifications';
import { fetchNotificationSettings } from '@/notifications/notification-settings-api';
import {
  clearNotificationState,
  ensureSeenBaseline,
  markSeen,
  setBackgroundSession,
} from '@/notifications/notification-store';

const CREATOR_NOTIFICATION_EVENT = 'creatorNotification';

const ignore = (): undefined => undefined;

function useAppIsActive(): boolean {
  const [active, setActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setActive(state === 'active');
    });
    return () => {
      subscription.remove();
    };
  }, []);
  return active;
}

/** The current pathname, readable from async callbacks. */
function usePathnameRef(): RefObject<string> {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);
  return pathnameRef;
}

/** The creator's "notify me" switch (Floatplane's contentFirebase); unknown creators default to on. */
async function creatorWantsNotifications(
  queryClient: QueryClient,
  token: string,
  creatorId: string | null,
): Promise<boolean> {
  if (!isNonEmpty(creatorId)) {
    return true;
  }
  try {
    const settings = await queryClient.query({
      queryKey: creatorNotificationSettingsKey(token),
      queryFn: () => fetchNotificationSettings(token),
      staleTime: 'static',
    });
    return settings.find((entry) => entry.creatorId === creatorId)?.contentFirebase ?? true;
  } catch {
    return true;
  }
}

/** Session mirror for the background task; sign-out forgets it (and what was shown). */
function useSessionMirror(token: string | null | undefined, sessionLoading: boolean): void {
  useEffect(() => {
    if (isNonEmpty(token)) {
      void setBackgroundSession(token);
    } else if (!sessionLoading) {
      void Promise.all([clearNotificationState(), cancelNewPostsCheck()]).catch(ignore);
    }
  }, [token, sessionLoading]);
}

/** First signed-in launch: ask once. */
function useFirstLaunchPrompt(
  token: string | null | undefined,
  enabled: boolean | null | undefined,
  setEnabled: (enable: boolean) => Promise<unknown>,
): void {
  const promptedRef = useRef(false);
  useEffect(() => {
    if (!isNonEmpty(token) || enabled !== null || promptedRef.current) {
      return;
    }
    promptedRef.current = true;
    void setEnabled(true).catch(ignore);
  }, [token, enabled, setEnabled]);
}

/** Background check follows the switch. */
function useBackgroundCheck(
  active: boolean,
  token: string | null | undefined,
  enabled: boolean | null | undefined,
): void {
  useEffect(() => {
    if (active) {
      void ensureSeenBaseline()
        .then(scheduleNewPostsCheck)
        .catch((error: unknown) => {
          logError('[Notifications] Could not schedule the background check:', error);
        });
    } else if (isNonEmpty(token) && enabled === false) {
      void cancelNewPostsCheck().catch(ignore);
    }
  }, [active, token, enabled]);
}

/** Turns one `creatorNotification` sync event into a local notification (unless muted or on screen). */
async function handleCreatorNotification(
  data: unknown,
  { queryClient, token, pathnameRef }: LiveNotificationContext,
): Promise<void> {
  const notification = parseCreatorNotification(data);
  if (!notification) {
    return;
  }
  if (isNonEmpty(notification.postId)) {
    void queryClient.invalidateQueries({ queryKey: ['videos-infinite'] });
  }
  if (!(await creatorWantsNotifications(queryClient, token, notification.creatorId))) {
    return;
  }
  // Already looking at it (floatplane.com does the same): just remember it was delivered.
  if (pathnameRef.current === notificationRoute(notification)) {
    await markSeen(notification.id);
    return;
  }
  await notifyOnce(notification);
}

interface LiveNotificationContext {
  queryClient: QueryClient;
  token: string;
  pathnameRef: RefObject<string>;
}

/** Live notifications while the app is open: holds the sync socket while `live`. */
function useLiveNotifications(live: boolean, token: string | null | undefined): void {
  const queryClient = useQueryClient();
  const pathnameRef = usePathnameRef();

  useEffect(() => {
    if (!live || !isNonEmpty(token)) {
      return undefined;
    }
    const context = { queryClient, token, pathnameRef };
    const socket = new FloatplaneSocket({
      token,
      onSyncEvent: (event, data) => {
        if (event !== CREATOR_NOTIFICATION_EVENT) {
          return;
        }
        handleCreatorNotification(data, context).catch((error: unknown) => {
          logError('[Notifications] Could not show a notification:', error);
        });
      },
    });
    socket.connect();
    return () => {
      socket.close();
    };
  }, [live, token, queryClient, pathnameRef]);
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
export function useNotificationSync(
  token: string | null | undefined,
  sessionLoading: boolean,
): void {
  const { preferences, setEnabled } = useNotificationPreferences();
  const appActive = useAppIsActive();
  const active = isNonEmpty(token) && notificationsActive(preferences);
  const enabled = preferences?.enabled;

  useSessionMirror(token, sessionLoading);
  useFirstLaunchPrompt(token, enabled, setEnabled);
  useBackgroundCheck(active, token, enabled);
  useLiveNotifications(active && appActive, token);
}
