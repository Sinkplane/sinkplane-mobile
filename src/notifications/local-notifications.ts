import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import type { AppNotification } from './creator-notification';
import { markSeen } from './notification-store';

/**
 * Showing notifications on this device. Floatplane only pushes to its own apps (Firebase), so this
 * app turns what it learns (the live sync socket, the background check) into local notifications.
 */

/** Android channel for new-post notifications (users can tune it in system settings). */
export const NEW_POSTS_CHANNEL_ID = 'new-posts';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

/** In-app route a notification opens, or null. */
export const notificationRoute = (notification: Pick<AppNotification, 'postId'>) =>
  notification.postId ? `/video/${notification.postId}` : null;

/**
 * Show notifications while the app is in the foreground too (by default iOS/Android hide them),
 * and create the Android channel. Call once at startup.
 */
export async function configureNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(NEW_POSTS_CHANNEL_ID, {
      name: 'New posts',
      description: 'New videos and posts from creators you subscribe to',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
}

function toPermissionState(status: Notifications.NotificationPermissionsStatus): PermissionState {
  const provisional = status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (status.granted || provisional) return 'granted';
  // `canAskAgain: false` means the OS won't show the prompt again (user said no / turned it off).
  return status.status === 'undetermined' && status.canAskAgain !== false ? 'undetermined' : 'denied';
}

export async function getPermissionState(): Promise<PermissionState> {
  return toPermissionState(await Notifications.getPermissionsAsync());
}

/** Ask for permission when the OS still allows prompting; resolves to the resulting state. */
export async function requestPermission(): Promise<PermissionState> {
  const current = await getPermissionState();
  if (current !== 'undetermined') return current;
  return toPermissionState(await Notifications.requestPermissionsAsync());
}

/** Present a notification now (no de-duplication; see notifyOnce). */
export async function presentNotification(notification: AppNotification): Promise<void> {
  const url = notificationRoute(notification);
  await Notifications.scheduleNotificationAsync({
    identifier: notification.id,
    content: {
      title: notification.title,
      body: notification.body,
      data: { url, postId: notification.postId, creatorId: notification.creatorId },
      ...(notification.creatorId ? { threadIdentifier: notification.creatorId } : {}),
    },
    trigger: Platform.OS === 'android' ? { channelId: NEW_POSTS_CHANNEL_ID } : null,
  });
}

/** Present unless this notification was already shown (by either delivery path). Returns whether it was shown. */
export async function notifyOnce(notification: AppNotification): Promise<boolean> {
  if (!(await markSeen(notification.id))) return false;
  await presentNotification(notification);
  return true;
}
