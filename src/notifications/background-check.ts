import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { authenticatedFetch, type Video } from '@/shared';

import { notificationForPost } from './creator-notification';
import { getPermissionState, presentNotification } from './local-notifications';
import { fetchNotificationSettings } from './notification-settings-api';
import { getBackgroundSession, getNotificationsEnabled, loadSeenState, saveSeenState } from './notification-store';

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
 */
export const RELEASE_SLACK_MS = 60 * 60 * 1000;

/** A creator's newest posts; [] when that request fails (the other creators still get checked). */
async function fetchLatestPosts(token: string, creatorId: string): Promise<Video[]> {
  const params = new URLSearchParams({ id: creatorId, limit: String(POSTS_PER_CREATOR), fetchAfter: '0', sort: 'DESC' });
  try {
    const response = await authenticatedFetch(`/api/v3/content/creator?${params.toString()}`, token);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const posts = (await response.json()) as Video[];
    return Array.isArray(posts) ? posts : [];
  } catch (error) {
    console.error(`[Notifications] Could not check ${creatorId} for new posts:`, error);
    return [];
  }
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
  const perCreator = await Promise.all(
    creators.map(async creator => (await fetchLatestPosts(token, creator.creatorId)).map(post => ({ post, creator }))),
  );

  const state = await loadSeenState();
  if (!state) {
    await saveSeenState({ checkedAt: now, ids: [] });
    return 0;
  }

  const seen = new Set(state.ids);
  const cutoff = state.checkedAt - RELEASE_SLACK_MS;
  const fresh = perCreator
    .flat()
    .map(({ post, creator }) => ({
      notification: notificationForPost(post, creator.title, creator.creatorId),
      released: Date.parse(post.releaseDate ?? ''),
    }))
    .filter(({ notification, released }) => released > cutoff && !seen.has(notification.id))
    // Oldest first, so the newest ends up on top of the tray; keep the newest when capping.
    .sort((a, b) => a.released - b.released)
    .slice(-MAX_NOTIFICATIONS_PER_RUN);

  // Re-read right before writing: the live socket may have recorded something while this ran.
  const latest = (await loadSeenState()) ?? state;
  const alreadyShown = new Set(latest.ids);
  const toShow = fresh.filter(({ notification }) => !alreadyShown.has(notification.id));
  await saveSeenState({ checkedAt: now, ids: [...toShow.map(({ notification }) => notification.id).reverse(), ...latest.ids] });

  for (const { notification } of toShow) await presentNotification(notification);
  return toShow.length;
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
