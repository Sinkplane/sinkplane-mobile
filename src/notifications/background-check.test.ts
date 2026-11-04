import {
  cancelNewPostsCheck,
  checkForNewPosts,
  defineNewPostsTask,
  MAX_NOTIFICATIONS_PER_RUN,
  NEW_POSTS_TASK,
  RELEASE_SLACK_MS,
  scheduleNewPostsCheck,
} from '@/notifications/background-check';
import { loadSeenState, markSeen, saveSeenState, setBackgroundSession, setNotificationsEnabled } from '@/notifications/notification-store';
import type { Video } from '@/shared';
import { gamingCreator, gamingMainChannel, makeVideo, techCreator, techMainChannel } from '@test/fixtures';
import { BackgroundTaskResult, BackgroundTaskStatus, mockBackgroundTask } from '@test/mocks/expo-background-task';
import { mockNotifications } from '@test/mocks/expo-notifications';
import { defineTask, mockTaskManager } from '@test/mocks/expo-task-manager';

const NOW = Date.parse('2026-10-28T12:00:00.000Z');
const LAST_RUN = NOW - 20 * 60 * 1000;

const respond = (status: number, body: unknown) =>
  ({ ok: status === 200, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;

let postsByCreator: Record<string, Video[] | 'error'>;
let settings: { id: string; title: string; contentFirebase: boolean }[];

beforeEach(async () => {
  postsByCreator = {};
  settings = [
    { id: techCreator.id, title: 'Tech Channel', contentFirebase: true },
    { id: gamingCreator.id, title: 'Gaming Channel', contentFirebase: true },
  ];
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/v3/user/notification/list') {
      return respond(
        200,
        settings.map(s => ({
          creator: { id: s.id, title: s.title },
          userNotificationSetting: { creator: s.id, contentFirebase: s.contentFirebase },
        })),
      );
    }
    const posts = postsByCreator[url.searchParams.get('id') ?? ''] ?? [];
    return posts === 'error' ? respond(500, 'down') : respond(200, posts);
  }) as typeof fetch;

  mockNotifications.setPermission('granted');
  await setNotificationsEnabled(true);
  await setBackgroundSession('tok');
  await saveSeenState({ checkedAt: LAST_RUN, ids: [] });
});

const techPost = (id: string, releasedAgoMs: number) =>
  makeVideo(techCreator, techMainChannel, { id, title: `Tech ${id}`, releaseDate: new Date(NOW - releasedAgoMs).toISOString() });
const gamingPost = (id: string, releasedAgoMs: number) =>
  makeVideo(gamingCreator, gamingMainChannel, { id, title: `Gaming ${id}`, releaseDate: new Date(NOW - releasedAgoMs).toISOString() });

const presentedIds = () => mockNotifications.presented.map(n => n.identifier);

describe('checkForNewPosts', () => {
  it('notifies about posts released since the last run, oldest first', async () => {
    postsByCreator[techCreator.id] = [techPost('t-new', 60_000), techPost('t-old', 3 * RELEASE_SLACK_MS)];
    postsByCreator[gamingCreator.id] = [gamingPost('g-new', 5 * 60_000)];

    expect(await checkForNewPosts(NOW)).toBe(2);
    expect(presentedIds()).toEqual(['post:g-new', 'post:t-new']);
    expect(mockNotifications.presented[1].content).toMatchObject({ title: 'New post from Tech Channel', body: 'Tech t-new' });
    expect(await loadSeenState()).toEqual({ checkedAt: NOW, ids: ['post:t-new', 'post:g-new'] });

    // Same posts next run: nothing new.
    expect(await checkForNewPosts(NOW + 60_000)).toBe(0);
  });

  it('counts posts that surfaced late (within the slack) but never twice', async () => {
    // Released before the previous run, but listed only now.
    postsByCreator[techCreator.id] = [techPost('late', NOW - LAST_RUN + 10 * 60 * 1000)];
    await markSeen('post:already');
    postsByCreator[gamingCreator.id] = [gamingPost('already', 60_000)];

    expect(await checkForNewPosts(NOW)).toBe(1);
    expect(presentedIds()).toEqual(['post:late']);
  });

  it('skips creators switched off and survives one creator failing', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    settings[0].contentFirebase = false;
    postsByCreator[techCreator.id] = [techPost('muted', 60_000)];
    postsByCreator[gamingCreator.id] = 'error';
    expect(await checkForNewPosts(NOW)).toBe(0);

    settings[0].contentFirebase = true;
    expect(await checkForNewPosts(NOW)).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(gamingCreator.id), expect.any(Error));
  });

  it('caps a burst, keeping the newest', async () => {
    postsByCreator[techCreator.id] = Array.from({ length: MAX_NOTIFICATIONS_PER_RUN + 2 }, (_, i) => techPost(`p${i}`, (i + 1) * 60_000));
    expect(await checkForNewPosts(NOW)).toBe(MAX_NOTIFICATIONS_PER_RUN);
    expect(presentedIds()[MAX_NOTIFICATIONS_PER_RUN - 1]).toBe('post:p0');
    expect(presentedIds()).not.toContain(`post:p${MAX_NOTIFICATIONS_PER_RUN + 1}`);
  });

  it('does not re-show what the live socket delivered during the run', async () => {
    postsByCreator[techCreator.id] = [techPost('raced', 60_000)];
    const realFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/content/creator')) await markSeen('post:raced');
      return realFetch(input, init);
    }) as typeof fetch;

    expect(await checkForNewPosts(NOW)).toBe(0);
  });

  it('records a baseline on the very first run', async () => {
    await saveSeenState(null);
    postsByCreator[techCreator.id] = [techPost('existing', 60_000)];
    expect(await checkForNewPosts(NOW)).toBe(0);
    expect(await loadSeenState()).toEqual({ checkedAt: NOW, ids: [] });
  });

  it('ignores a malformed post list and posts without a release date', async () => {
    postsByCreator[techCreator.id] = { not: 'a list' } as unknown as Video[];
    postsByCreator[gamingCreator.id] = [{ ...gamingPost('undated', 0), releaseDate: null } as unknown as Video];
    expect(await checkForNewPosts(NOW)).toBe(0);
  });

  it('does nothing when signed out, switched off or not permitted', async () => {
    postsByCreator[techCreator.id] = [techPost('t', 60_000)];

    mockNotifications.setPermission('denied');
    expect(await checkForNewPosts(NOW)).toBe(0);

    mockNotifications.setPermission('granted');
    await setNotificationsEnabled(false);
    expect(await checkForNewPosts(NOW)).toBe(0);

    await setNotificationsEnabled(true);
    await setBackgroundSession(null);
    expect(await checkForNewPosts(NOW)).toBe(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('task', () => {
  it('defines the task once and reports the outcome', async () => {
    defineNewPostsTask();
    defineNewPostsTask();
    expect(defineTask).toHaveBeenCalledTimes(1);

    expect(await mockTaskManager.run(NEW_POSTS_TASK)).toBe(BackgroundTaskResult.Success);

    globalThis.fetch = jest.fn(async () => respond(500, 'down')) as typeof fetch;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await mockTaskManager.run(NEW_POSTS_TASK)).toBe(BackgroundTaskResult.Failed);
  });

  it('schedules every 15 minutes unless background work is restricted', async () => {
    expect(await scheduleNewPostsCheck()).toBe(true);
    expect(mockTaskManager.registered.get(NEW_POSTS_TASK)).toEqual({ minimumInterval: 15 });
    // Already registered: no re-registration.
    expect(await scheduleNewPostsCheck()).toBe(true);

    await cancelNewPostsCheck();
    expect(mockTaskManager.registered.has(NEW_POSTS_TASK)).toBe(false);
    await cancelNewPostsCheck();

    mockBackgroundTask.status = BackgroundTaskStatus.Restricted;
    expect(await scheduleNewPostsCheck()).toBe(false);
    expect(mockTaskManager.registered.has(NEW_POSTS_TASK)).toBe(false);
  });
});
