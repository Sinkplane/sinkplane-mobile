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

/** What the app has already notified about, and how far the background check has looked. */
export interface SeenState {
  /** Epoch ms notifications were switched on: posts released before this never notify. */
  since: number;
  /** Epoch ms of the last completed background check. */
  checkedAt: number;
  /**
   * Creators whose posts couldn't be fetched, with the `checkedAt` they still need checking from:
   * the shared clock moves on, but their window doesn't until a fetch succeeds.
   */
  pending: Record<string, number>;
  /** Notification ids (`post:<id>`), newest first. */
  ids: string[];
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Run `task` once every earlier one has settled. The live socket and the background check both
 * read-modify-write the seen state (and run in the same JS runtime), so every update goes through
 * here; otherwise concurrent writers drop each other's ids or show the same post twice.
 * Never call another locked function from inside `task`: it would wait on itself.
 */
export function withSeenLock<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
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

const isTimestampMap = (value: unknown): value is Record<string, number> =>
  !!value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(v => typeof v === 'number');

/** Unlocked read; use inside withSeenLock when the result feeds a write. */
export async function loadSeenState(): Promise<SeenState | null> {
  const value = await read(KEYS.seen);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SeenState>;
    if (typeof parsed.checkedAt !== 'number' || !Array.isArray(parsed.ids)) return null;
    return {
      // State written before `since` existed: no lower bound beyond the checked-at window.
      since: typeof parsed.since === 'number' ? parsed.since : 0,
      checkedAt: parsed.checkedAt,
      pending: isTimestampMap(parsed.pending) ? parsed.pending : {},
      ids: parsed.ids.filter((id): id is string => typeof id === 'string'),
    };
  } catch {
    return null;
  }
}

/** Unlocked write; use inside withSeenLock. */
export async function saveSeenState(state: SeenState | null): Promise<void> {
  if (!state) {
    await write(KEYS.seen, null);
    return;
  }
  const ids = [...new Set(state.ids)].slice(0, SEEN_LIMIT);
  await write(KEYS.seen, JSON.stringify({ since: state.since, checkedAt: state.checkedAt, pending: state.pending, ids }));
}

const freshState = (now: number, ids: string[] = []): SeenState => ({ since: now, checkedAt: now, pending: {}, ids });

/**
 * Show `id` once: runs `present` unless the id was already delivered (the live socket and the
 * background check can both learn about the same post), and records it only after `present`
 * succeeds, so a failed presentation is retried. Returns whether it was presented.
 */
export function deliverOnce(id: string, present: () => Promise<void>, now = Date.now()): Promise<boolean> {
  return withSeenLock(async () => {
    const state = await loadSeenState();
    if (state?.ids.includes(id)) return false;
    await present();
    await saveSeenState(state ? { ...state, ids: [id, ...state.ids] } : freshState(now, [id]));
    return true;
  });
}

/** Record `id` as delivered without presenting it. Returns false when it already was. */
export const markSeen = (id: string, now = Date.now()) => deliverOnce(id, async () => undefined, now);

/**
 * Start the "new since" clock if it isn't running yet, so the first background run already
 * reports posts released after this point (and nothing released before it).
 */
export function ensureSeenBaseline(now = Date.now()): Promise<void> {
  return withSeenLock(async () => {
    if (!(await loadSeenState())) await saveSeenState(freshState(now));
  });
}

/**
 * Restart the clock (notifications switched on): posts released while they were off don't count
 * as new. Delivered ids are kept, so nothing shows twice.
 */
export function resetSeenBaseline(now = Date.now()): Promise<void> {
  return withSeenLock(async () => saveSeenState(freshState(now, (await loadSeenState())?.ids)));
}

/** Forget everything (sign-out: the next account starts fresh). */
export async function clearNotificationState(): Promise<void> {
  await Promise.all([write(KEYS.session, null), withSeenLock(() => write(KEYS.seen, null))]);
}
