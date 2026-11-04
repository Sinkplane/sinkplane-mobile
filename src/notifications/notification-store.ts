import * as SecureStore from 'expo-secure-store';

/**
 * Persistent notification state (expo-secure-store, the only storage this app ships).
 *
 * Everything here may be read by the background task, which can run while the device is locked —
 * so values are written with AFTER_FIRST_UNLOCK (the default, WHEN_UNLOCKED, makes iOS keychain
 * reads fail on a locked device). That is also why the session token is mirrored under its own key:
 * the shared SessionProvider stores `fptoken` with the default accessibility.
 */

const KEYS = {
  enabled: 'sinkplane.notifications.enabled',
  session: 'sinkplane.notifications.session',
  seen: 'sinkplane.notifications.seen',
} as const;

const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

/** How many delivered ids to remember (each ~30 bytes; keeps the entry well under 2 KB). */
export const SEEN_LIMIT = 50;

/** What the app has already notified about, and when the background check last looked. */
export interface SeenState {
  /** Epoch ms of the last background check (or of the first notification, if that came first). */
  checkedAt: number;
  /** Notification ids (`post:<id>`), newest first. */
  ids: string[];
}

async function read(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key, OPTIONS);
  } catch {
    return null;
  }
}

async function write(key: string, value: string | null): Promise<void> {
  if (value === null) await SecureStore.deleteItemAsync(key, OPTIONS);
  else await SecureStore.setItemAsync(key, value, OPTIONS);
}

/** The user's choice: true/false, or null when they haven't been asked yet. */
export async function getNotificationsEnabled(): Promise<boolean | null> {
  const value = await read(KEYS.enabled);
  return value === null ? null : value === 'true';
}

export const setNotificationsEnabled = (enabled: boolean | null) => write(KEYS.enabled, enabled === null ? null : String(enabled));

/** Session token for the background check (null after sign-out). */
export const getBackgroundSession = () => read(KEYS.session);

export const setBackgroundSession = (token: string | null) => write(KEYS.session, token);

export async function loadSeenState(): Promise<SeenState | null> {
  const value = await read(KEYS.seen);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SeenState>;
    if (typeof parsed.checkedAt !== 'number' || !Array.isArray(parsed.ids)) return null;
    return { checkedAt: parsed.checkedAt, ids: parsed.ids.filter((id): id is string => typeof id === 'string') };
  } catch {
    return null;
  }
}

export async function saveSeenState(state: SeenState | null): Promise<void> {
  if (!state) {
    await write(KEYS.seen, null);
    return;
  }
  const ids = [...new Set(state.ids)].slice(0, SEEN_LIMIT);
  await write(KEYS.seen, JSON.stringify({ checkedAt: state.checkedAt, ids }));
}

/**
 * Record `id` as delivered. Returns false when it already was (so callers skip showing it again):
 * the live socket and the background check can both learn about the same post.
 */
export async function markSeen(id: string, now = Date.now()): Promise<boolean> {
  const state = await loadSeenState();
  if (state?.ids.includes(id)) return false;
  await saveSeenState({ checkedAt: state?.checkedAt ?? now, ids: [id, ...(state?.ids ?? [])] });
  return true;
}

/**
 * Start the "new since" clock if it isn't running yet (when notifications get turned on), so the
 * first background run already reports posts released after this point.
 */
export async function ensureSeenBaseline(now = Date.now()): Promise<void> {
  if (!(await loadSeenState())) await saveSeenState({ checkedAt: now, ids: [] });
}

/** Forget everything (sign-out: the next account starts fresh). */
export async function clearNotificationState(): Promise<void> {
  await Promise.all([write(KEYS.session, null), write(KEYS.seen, null)]);
}
