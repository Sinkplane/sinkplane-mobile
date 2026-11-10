/**
 * E2E: the background new-posts check (as the OS runs it) and its edge cases, including sign-out
 * cleanup.
 */
import { gamingCreator, makeVideo, techCreator, techMainChannel } from '@test/fixtures';
import { BackgroundTaskStatus } from '@test/mocks/expo-background-task';

import {
  launchWithNotifications,
  presented,
  runCheck,
  settingsTab,
  TASK,
} from './helpers/notifications-flows';
import { loadRuntime, type Runtime } from './helpers/runtime';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

describe('background check', () => {
  it('notifies about posts released since notifications were turned on', async () => {
    await launchWithNotifications(rt);
    await rt.until(() => {
      expect(rt.secureStore.has('sinkplane.notifications.seen')).toBe(true);
    });

    const fresh = makeVideo(techCreator, techMainChannel, {
      id: 'fresh-post',
      title: 'Fresh Upload',
      releaseDate: new Date(Date.now() + 60_000).toISOString(),
    });
    rt.api.setChannelVideos(techCreator.id, techMainChannel.id, [
      fresh,
      ...rt.api.channelVideos(techMainChannel.id),
    ]);

    expect(await runCheck(rt)).toBe(1); // BackgroundTaskResult.Success
    expect(presented(rt)).toHaveLength(1);
    expect(presented(rt)[0]?.content).toMatchObject({
      title: 'New post from Tech Channel',
      body: 'Fresh Upload',
      data: { postId: 'fresh-post' },
    });

    // Nothing new on the next run.
    await runCheck(rt);
    expect(presented(rt)).toHaveLength(1);
  });

  it('does nothing once signed out', async () => {
    await launchWithNotifications(rt);
    await rt.selectTab('settings');
    await rt.fireEvent.press(settingsTab(rt).getByText('Sign Out'));
    await rt.until(() => {
      expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy();
    });

    await rt.until(() => {
      expect(rt.secureStore.has('sinkplane.notifications.session')).toBe(false);
    });
    expect(rt.taskManager.registered.has(TASK)).toBe(false);
    expect(rt.socket.connected()).toHaveLength(0);

    const before = rt.api.requests.length;
    await runCheck(rt);
    expect(rt.api.requests).toHaveLength(before);
  });
});

describe('background check edge cases', () => {
  const released = (id: string, offsetMs: number) =>
    makeVideo(techCreator, techMainChannel, {
      id,
      title: id,
      releaseDate: new Date(Date.now() + offsetMs).toISOString(),
    });

  it('starts a baseline on the first run and caps a burst', async () => {
    await launchWithNotifications(rt);
    rt.secureStore.delete('sinkplane.notifications.seen');
    await runCheck(rt);
    expect(presented(rt)).toHaveLength(0);

    const burst = Array.from({ length: 7 }, (_, i) =>
      released(`burst-${String(i)}`, (i + 1) * 60_000),
    );
    rt.api.setChannelVideos(techCreator.id, techMainChannel.id, [...burst].reverse());
    await rt.advanceTime(10 * 60_000);
    await runCheck(rt);
    expect(presented(rt)).toHaveLength(5);
  });

  it('checks the other creators when one fails, and skips muted ones', async () => {
    await launchWithNotifications(rt);
    await rt.until(() => {
      expect(rt.secureStore.has('sinkplane.notifications.seen')).toBe(true);
    });
    rt.api.notificationSettings.set(gamingCreator.id, {
      contentFirebase: false,
      contentEmail: false,
    });
    rt.api.setChannelVideos(techCreator.id, techMainChannel.id, [released('tech-new', 60_000)]);
    rt.api.failRequests('GET /api/v3/content/creator', { status: 500, body: 'down' });
    const before = rt.api.requests.length;

    await runCheck(rt);
    expect(presented(rt)).toHaveLength(0);
    await runCheck(rt);
    expect(presented(rt).map((n) => n.identifier)).toEqual(['post:tech-new']);
    // The muted creator was never fetched.
    const checked = rt.api.requests
      .slice(before)
      .filter((req) => req.path === '/api/v3/content/creator');
    expect(checked.map((req) => req.params.get('id'))).toEqual([techCreator.id, techCreator.id]);
  });

  it('reports a failed run when Floatplane is unreachable', async () => {
    await launchWithNotifications(rt);
    rt.api.failRequests('GET /api/v3/user/notification/list', { status: 500, body: 'down' });
    expect(await runCheck(rt)).toBe(2); // BackgroundTaskResult.Failed
  });

  it('skips scheduling when background work is restricted', async () => {
    rt.backgroundTask.status = BackgroundTaskStatus.Restricted;
    await launchWithNotifications(rt);
    await rt.advanceTime(500);
    expect(rt.taskManager.registered.has(TASK)).toBe(false);
  });
});
