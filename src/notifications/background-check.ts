import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { authenticatedFetch, type Video } from '@/shared';

import { notificationForPost } from './creator-notification';
import { getPermissionState, presentNotification } from './local-notifications';
import { fetchNotificationSettings } from './notification-settings-api';
import {
  getBackgroundSession,
  getNotificationsEnabled,
  loadSeenState,
  saveSeenState,
  withSeenLock,
  type SeenState,
} from './notification-store';

/**
 * Background check for new posts — the closed/backgrounded-app half of notifications (the live
 * socket stops when the OS suspends the app). Runs through expo-background-task (WorkManager /
 * BGTaskScheduler): roughly every 15+ minutes, at the OS's discretion, when there is network.
 *
 * Each run lists the creators the user wants notifications for (Floatplane's own per-creator
 * `contentFirebase` switch), fetches their newest posts and notifies about the ones released since
 * the previous run that haven't been shown yet.
 */

export const NEW_POSTS_TASK = 'sinkplane-new-posts';

/** Minutes between runs (Android's WorkManager minimum). */
export const CHECK_INTERVAL_MINUTES = 15;

/** Newest posts fetched per creator each run. */
export const POSTS_PER_CREATOR = 5;

/** Notifications shown per run at most (a burst after a long gap shouldn't flood the tray). */
export const MAX_NOTIFICATIONS_PER_RUN = 5;

/**
 * Posts released this long before the previous run still count as new: the content listing can
 * lag a release by a few minutes. Already-notified ids are remembered, so nothing shows twice.
 * Never reaches back past when notifications were switched on (`SeenState.since`).
 */
export const RELEASE_SLACK_MS = 60 * 60 * 1000;

/** A creator's newest posts, or null when that request fails (the other creators still get checked). */
async function fetchLatestPosts(token: string, creatorId: string): Promise<Video[] | null> {
  const params = new URLSearchParams({ id: creatorId, limit: String(POSTS_PER_CREATOR), fetchAfter: '0', sort: 'DESC' });
  try {
    const response = await authenticatedFetch(`/api/v3/content/creator?${params.toString()}`, token);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const posts = (await response.json()) as Video[];
    return Array.isArray(posts) ? posts : [];
  } catch (error) {
    console.error(`[Notifications] Could not check ${creatorId} for new posts:`, error);
    return null;
  }
}

interface CreatorPosts {
  creatorId: string;
  title: string;
  /** null: the fetch failed. */
  posts: Video[] | null;
}

/** Posts released inside each creator's window that haven't been shown, oldest first, capped to the newest. */
function freshNotifications(state: SeenState, results: CreatorPosts[]) {
  const seen = new Set(state.ids);
  return results
    .flatMap(({ creatorId, title, posts }) => {
      const from = state.pending[creatorId] ?? state.checkedAt;
      const cutoff = Math.max(from - RELEASE_SLACK_MS, state.since);
      return (posts ?? [])
        .map(post => ({ notification: notificationForPost(post, title, creatorId), released: Date.parse(post.releaseDate ?? '') }))
        .filter(({ notification, released }) => released > cutoff && !seen.has(notification.id));
    })
    .sort((a, b) => a.released - b.released)
    .slice(-MAX_NOTIFICATIONS_PER_RUN)
    .map(({ notification }) => notification);
}

/** Creators that failed this run keep the window they still need (their earlier one, if they failed before too). */
function pendingAfter(state: SeenState, results: CreatorPosts[]): Record<string, number> {
  const pending: Record<string, number> = {};
  for (const { creatorId, posts } of results) {
    if (posts === null) pending[creatorId] = state.pending[creatorId] ?? state.checkedAt;
  }
  return pending;
}

/**
 * One background run. Returns how many notifications were shown.
 * The first run only records a baseline (nothing already published counts as new).
 */
export async function checkForNewPosts(now = Date.now()): Promise<number> {
  const token = await getBackgroundSession();
  if (!token || (await getNotificationsEnabled()) !== true) return 0;
  if ((await getPermissionState()) !== 'granted') return 0;

  const creators = (await fetchNotificationSettings(token)).filter(creator => creator.contentFirebase);
  const results: CreatorPosts[] = await Promise.all(
    creators.map(async ({ creatorId, title }) => ({ creatorId, title, posts: await fetchLatestPosts(token, creatorId) })),
  );

  // Locked from the read to the write: the live socket may deliver posts meanwhile.
  return withSeenLock(async () => {
    const state = await loadSeenState();
    if (!state) {
      await saveSeenState({ since: now, checkedAt: now, pending: {}, ids: [] });
      return 0;
    }

    // Record each id only once it was presented. If presenting fails, keep what was shown but not
    // the new window, so the rest are retried next run.
    const shown: string[] = [];
    try {
      for (const notification of freshNotifications(state, results)) {
        await presentNotification(notification);
        shown.unshift(notification.id);
      }
    } catch (error) {
      await saveSeenState({ ...state, ids: [...shown, ...state.ids] });
      throw error;
    }
    await saveSeenState({ since: state.since, checkedAt: now, pending: pendingAfter(state, results), ids: [...shown, ...state.ids] });
    return shown.length;
  });
}

/** Register the task body with the task manager. Must run at module scope on every launch. */
export function defineNewPostsTask(): void {
  if (TaskManager.isTaskDefined(NEW_POSTS_TASK)) return;
  TaskManager.defineTask(NEW_POSTS_TASK, async () => {
    try {
      await checkForNewPosts();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      console.error('[Notifications] Background check failed:', error);
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/** Schedule the periodic check (no-op when background work is restricted, e.g. Low Power Mode). */
export async function scheduleNewPostsCheck(): Promise<boolean> {
  if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return false;
  if (!(await TaskManager.isTaskRegisteredAsync(NEW_POSTS_TASK))) {
    await BackgroundTask.registerTaskAsync(NEW_POSTS_TASK, { minimumInterval: CHECK_INTERVAL_MINUTES });
  }
  return true;
}

export async function cancelNewPostsCheck(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(NEW_POSTS_TASK)) await BackgroundTask.unregisterTaskAsync(NEW_POSTS_TASK);
}
