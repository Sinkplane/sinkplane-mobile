import * as SecureStore from 'expo-secure-store';

import {
  clearNotificationState,
  ensureSeenBaseline,
  getBackgroundSession,
  getNotificationsEnabled,
  loadSeenState,
  markSeen,
  resetSeenBaseline,
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
    expect(await loadSeenState()).toEqual({ since: 1000, checkedAt: 1000, pending: {}, ids: ['post:b', 'post:a'] });
  });

  it('keeps every id recorded at the same time', async () => {
    expect(await Promise.all([markSeen('post:a'), markSeen('post:b'), markSeen('post:a')])).toEqual([true, true, false]);
    expect((await loadSeenState())?.ids.sort()).toEqual(['post:a', 'post:b']);
  });

  it('keeps going after a failed update', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain'));
    await expect(markSeen('post:a')).rejects.toThrow('keychain');
    expect(await markSeen('post:a')).toBe(true);
  });

  it('caps and de-duplicates what it keeps', async () => {
    const ids = Array.from({ length: SEEN_LIMIT + 10 }, (_, i) => `post:${i}`);
    await saveSeenState({ since: 1, checkedAt: 1, pending: {}, ids: ['post:0', ...ids] });
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
    expect(await loadSeenState()).toEqual({ since: 0, checkedAt: 5, pending: {}, ids: ['post:a'] });
    items.set('sinkplane.notifications.seen', JSON.stringify({ since: 3, checkedAt: 5, pending: { c1: 'x' }, ids: [] }));
    expect(await loadSeenState()).toEqual({ since: 3, checkedAt: 5, pending: {}, ids: [] });
    items.set('sinkplane.notifications.seen', JSON.stringify({ since: 3, checkedAt: 5, pending: { c1: 4 }, ids: [] }));
    expect(await loadSeenState()).toEqual({ since: 3, checkedAt: 5, pending: { c1: 4 }, ids: [] });
  });

  it('starts the baseline only once', async () => {
    await ensureSeenBaseline(100);
    await ensureSeenBaseline(200);
    expect(await loadSeenState()).toEqual({ since: 100, checkedAt: 100, pending: {}, ids: [] });
  });

  it('restarts the baseline, keeping the delivered ids', async () => {
    await resetSeenBaseline(100);
    expect(await loadSeenState()).toEqual({ since: 100, checkedAt: 100, pending: {}, ids: [] });
    await saveSeenState({ since: 100, checkedAt: 200, pending: { c1: 150 }, ids: ['post:a'] });
    await resetSeenBaseline(300);
    expect(await loadSeenState()).toEqual({ since: 300, checkedAt: 300, pending: {}, ids: ['post:a'] });
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
