import { Platform } from 'react-native';

import {
  configureNotifications,
  getPermissionState,
  NEW_POSTS_CHANNEL_ID,
  notificationRoute,
  notifyOnce,
  presentNotification,
  requestPermission,
} from '@/notifications/local-notifications';
import { mockNotifications, requestPermissionsAsync } from '@test/mocks/expo-notifications';

const notification = { id: 'post:p1', title: 'New post from LTT', body: 'A video', creatorId: 'c1', postId: 'p1' };

const withPlatform = async (os: typeof Platform.OS, run: () => Promise<void>) => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  try {
    await run();
  } finally {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  }
};

describe('configureNotifications', () => {
  it('shows notifications in the foreground', async () => {
    await configureNotifications();
    await expect(mockNotifications.handler?.handleNotification({} as never)).resolves.toMatchObject({
      shouldShowBanner: true,
      shouldShowList: true,
    });
    expect(mockNotifications.channels.size).toBe(0);
  });

  it('creates the Android channel', async () => {
    await withPlatform('android', async () => {
      await configureNotifications();
      expect(mockNotifications.channels.get(NEW_POSTS_CHANNEL_ID)).toMatchObject({ name: 'New posts' });
    });
  });
});

describe('permission', () => {
  it('maps OS statuses', async () => {
    expect(await getPermissionState()).toBe('undetermined');
    mockNotifications.setPermission('granted');
    expect(await getPermissionState()).toBe('granted');
    mockNotifications.setPermission('denied');
    expect(await getPermissionState()).toBe('denied');
    // Undetermined but the OS won't prompt: as good as denied.
    mockNotifications.setPermission('undetermined', false);
    expect(await getPermissionState()).toBe('denied');
    // iOS provisional authorization delivers quietly: counts as granted.
    mockNotifications.permission = { granted: false, status: 'undetermined' as never, canAskAgain: true, ios: { status: 3 } };
    expect(await getPermissionState()).toBe('granted');
  });

  it('prompts only when the OS still allows it', async () => {
    mockNotifications.promptAnswer = 'denied';
    expect(await requestPermission()).toBe('denied');
    expect(requestPermissionsAsync).toHaveBeenCalledTimes(1);

    expect(await requestPermission()).toBe('denied');
    expect(requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });
});

describe('presenting', () => {
  it('shows a notification that opens the post', async () => {
    await presentNotification(notification);
    expect(mockNotifications.presented).toEqual([
      {
        identifier: 'post:p1',
        content: {
          title: 'New post from LTT',
          body: 'A video',
          data: { url: '/video/p1', postId: 'p1', creatorId: 'c1' },
          threadIdentifier: 'c1',
        },
        trigger: null,
      },
    ]);
  });

  it('uses the new-posts channel on Android and omits the thread without a creator', async () => {
    await withPlatform('android', async () => {
      await presentNotification({ ...notification, creatorId: null, postId: null });
    });
    expect(mockNotifications.presented[0].trigger).toEqual({ channelId: NEW_POSTS_CHANNEL_ID });
    expect(mockNotifications.presented[0].content).not.toHaveProperty('threadIdentifier');
    expect(mockNotifications.presented[0].content.data).toMatchObject({ url: null });
  });

  it('notifyOnce shows each id once', async () => {
    expect(await notifyOnce(notification)).toBe(true);
    expect(await notifyOnce(notification)).toBe(false);
    expect(mockNotifications.presented).toHaveLength(1);
  });

  it('routes post notifications to the video page', () => {
    expect(notificationRoute({ postId: 'p1' })).toBe('/video/p1');
    expect(notificationRoute({ postId: null })).toBeNull();
  });
});
