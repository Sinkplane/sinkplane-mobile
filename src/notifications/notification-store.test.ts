import * as SecureStore from 'expo-secure-store';

import {
  clearNotificationState,
  ensureSeenBaseline,
  getBackgroundSession,
  getNotificationsEnabled,
  loadSeenState,
  markSeen,
  saveSeenState,
  SEEN_LIMIT,
  setBackgroundSession,
  setNotificationsEnabled,
} from '@/notifications/notification-store';
import { items } from '@test/mocks/expo-secure-store';

describe('enabled flag', () => {
  it('is null until chosen, then round-trips', async () => {
    expect(await getNotificationsEnabled()).toBeNull();
    await setNotificationsEnabled(true);
    expect(await getNotificationsEnabled()).toBe(true);
    await setNotificationsEnabled(false);
    expect(await getNotificationsEnabled()).toBe(false);
    await setNotificationsEnabled(null);
    expect(await getNotificationsEnabled()).toBeNull();
  });

  it('writes with AFTER_FIRST_UNLOCK so the background task can read it while locked', async () => {
    await setNotificationsEnabled(true);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('sinkplane.notifications.enabled', 'true', {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  });

  it('reads as unset when the keychain is unavailable', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('locked'));
    expect(await getNotificationsEnabled()).toBeNull();
  });
});

describe('background session', () => {
  it('stores and clears the token', async () => {
    await setBackgroundSession('tok');
    expect(await getBackgroundSession()).toBe('tok');
    await setBackgroundSession(null);
    expect(await getBackgroundSession()).toBeNull();
  });
});

describe('seen state', () => {
  it('records ids once', async () => {
    expect(await markSeen('post:a', 1000)).toBe(true);
    expect(await markSeen('post:b', 2000)).toBe(true);
    expect(await markSeen('post:a', 3000)).toBe(false);
    expect(await loadSeenState()).toEqual({ checkedAt: 1000, ids: ['post:b', 'post:a'] });
  });

  it('caps and de-duplicates what it keeps', async () => {
    const ids = Array.from({ length: SEEN_LIMIT + 10 }, (_, i) => `post:${i}`);
    await saveSeenState({ checkedAt: 1, ids: ['post:0', ...ids] });
    const state = await loadSeenState();
    expect(state?.ids).toHaveLength(SEEN_LIMIT);
    expect(state?.ids.slice(0, 2)).toEqual(['post:0', 'post:1']);
  });

  it('treats corrupt or foreign data as no state', async () => {
    items.set('sinkplane.notifications.seen', 'not json');
    expect(await loadSeenState()).toBeNull();
    items.set('sinkplane.notifications.seen', JSON.stringify({ checkedAt: 'x', ids: [] }));
    expect(await loadSeenState()).toBeNull();
    items.set('sinkplane.notifications.seen', JSON.stringify({ checkedAt: 5, ids: ['post:a', 7] }));
    expect(await loadSeenState()).toEqual({ checkedAt: 5, ids: ['post:a'] });
  });

  it('starts the baseline only once', async () => {
    await ensureSeenBaseline(100);
    await ensureSeenBaseline(200);
    expect(await loadSeenState()).toEqual({ checkedAt: 100, ids: [] });
  });

  it('clears the session and seen state, keeping the user’s choice', async () => {
    await setNotificationsEnabled(true);
    await setBackgroundSession('tok');
    await markSeen('post:a');
    await clearNotificationState();
    expect(await getBackgroundSession()).toBeNull();
    expect(await loadSeenState()).toBeNull();
    expect(await getNotificationsEnabled()).toBe(true);
    await saveSeenState(null);
    expect(await loadSeenState()).toBeNull();
  });
});
