/**
 * E2E: new-post notifications — the permission prompt on first launch, live notifications from
 * Floatplane's sync socket, the background check, tapping a notification (running and cold start),
 * the Settings section (master switch, blocked permission, Floatplane's per-creator switches), and
 * sign-out cleanup.
 */
import { gamingCreator, makeVideo, techCreator, techMainChannel } from '@test/fixtures';

import { loadRuntime, type Runtime } from './helpers/runtime';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

const TASK = 'sinkplane-new-posts';
const POST_ID = 'ch-tech-main-01';
const settingsTab = () => rt.inTab('settings');
const presented = () => rt.notifications.mockNotifications.presented;

async function launch() {
  const token = rt.seedSession();
  await rt.renderApp();
  await rt.until(() => expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy());
  return token;
}

/** Launch signed in with notifications already on (permission granted earlier). */
async function launchWithNotifications() {
  rt.notifications.mockNotifications.setPermission('granted');
  rt.secureStore.set('sinkplane.notifications.enabled', 'true');
  const token = await launch();
  await rt.until(() => expect(rt.socket.connected()).toHaveLength(1));
  return token;
}

async function openSettings() {
  await rt.selectTab('settings');
  await rt.until(() => expect(rt.selectedTab()).toBe('settings'));
}

describe('first launch', () => {
  it('asks for permission once signed in, then connects and schedules the background check', async () => {
    const token = await launch();

    await rt.until(() => expect(rt.socket.connected()).toHaveLength(1));
    expect(rt.notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(rt.secureStore.get('sinkplane.notifications.enabled')).toBe('true');

    // Token-mode sync session, with the browser User-Agent Cloudflare requires.
    const [socket] = rt.socket.connected();
    expect(socket.token).toBe(token);
    expect(socket.url).toContain('EIO=3&transport=websocket');
    expect(socket.headers['User-Agent']).toMatch(/^Mozilla\/5\.0/);

    await rt.until(() => expect(rt.taskManager.registered.get(TASK)).toEqual({ minimumInterval: 15 }));
    // The background check gets its own copy of the session.
    expect(rt.secureStore.get('sinkplane.notifications.session')).toBe(token);
  });

  it('stays off without a socket when the permission is refused', async () => {
    rt.notifications.mockNotifications.promptAnswer = 'denied';
    await launch();

    await rt.until(() => expect(rt.secureStore.get('sinkplane.notifications.enabled')).toBe('false'));
    await rt.advanceTime(1000);
    expect(rt.socket.sockets).toHaveLength(0);
    expect(rt.taskManager.registered.has(TASK)).toBe(false);
  });

  it('does not prompt on the sign-in screen', async () => {
    await rt.renderApp();
    await rt.until(() => expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy());
    await rt.advanceTime(500);
    expect(rt.notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('live notifications', () => {
  it('shows a notification for a new post and opens the video when tapped', async () => {
    await launchWithNotifications();

    rt.socket.notifyPostRelease({
      title: 'New post from Tech Channel',
      message: 'Main Channel Video 01',
      creator: techCreator.id,
      content: POST_ID,
    });
    await rt.until(() => expect(presented()).toHaveLength(1));
    expect(presented()[0]).toMatchObject({
      identifier: `post:${POST_ID}`,
      content: { title: 'New post from Tech Channel', body: 'Main Channel Video 01', data: { postId: POST_ID, url: `/video/${POST_ID}` } },
    });

    await rt.act(async () => rt.notifications.tapNotification({ postId: POST_ID }));
    await rt.until(() => expect(rt.screen.getByTestId('video-title')).toHaveTextContent('Main Channel Video 01'));
  });

  it('shows each post once, even when announced again', async () => {
    await launchWithNotifications();
    const announce = () => rt.socket.notifyPostRelease({ title: 'New post', message: 'Hi', creator: techCreator.id, content: POST_ID });

    announce();
    await rt.until(() => expect(presented()).toHaveLength(1));
    announce();
    await rt.advanceTime(500);
    expect(presented()).toHaveLength(1);
  });

  it('skips creators whose notifications are switched off on Floatplane', async () => {
    rt.api.notificationSettings.set(techCreator.id, { contentFirebase: false, contentEmail: false });
    await launchWithNotifications();

    rt.socket.notifyPostRelease({ title: 'Muted', message: 'Nope', creator: techCreator.id, content: POST_ID });
    rt.socket.notifyPostRelease({ title: 'New post from Gaming', message: 'Yes', creator: gamingCreator.id, content: 'gaming-post' });

    await rt.until(() => expect(presented()).toHaveLength(1));
    expect(presented()[0].content.title).toBe('New post from Gaming');
  });

  it('does not notify about the post the user is already watching', async () => {
    await launchWithNotifications();
    await rt.fireEvent.press(rt.screen.getByTestId(`video-list-item-${POST_ID}`));
    await rt.until(() => expect(rt.screen.getByTestId('video-screen')).toBeTruthy());

    rt.socket.notifyPostRelease({ title: 'New post', message: 'This one', creator: techCreator.id, content: POST_ID });
    await rt.advanceTime(500);
    expect(presented()).toHaveLength(0);
  });

  it('reconnects after the connection drops', async () => {
    await launchWithNotifications();

    rt.socket.connected()[0].drop();
    await rt.advanceTime(1500);
    await rt.until(() => expect(rt.socket.connected()).toHaveLength(1));
    expect(rt.socket.sockets).toHaveLength(2);
  });
});

describe('opening from a notification', () => {
  it('opens the video when a tap launched the app', async () => {
    rt.notifications.mockNotifications.setPermission('granted');
    rt.notifications.mockNotifications.lastResponse = rt.notifications.makeResponse({ postId: POST_ID });
    rt.seedSession();
    await rt.renderApp();

    await rt.until(() => expect(rt.screen.getByTestId('video-title')).toHaveTextContent('Main Channel Video 01'));
    expect(rt.notifications.mockNotifications.lastResponse).toBeNull();
  });

  it('ignores taps on notifications without a post', async () => {
    await launchWithNotifications();

    await rt.act(async () => rt.notifications.tapNotification({ url: null }));
    await rt.advanceTime(200);
    expect(rt.screen.queryByTestId('video-screen')).toBeNull();
  });
});

describe('background check', () => {
  const runCheck = async () => {
    // The entry file defines the task body; here the app modules come from the test's registry.
    const { defineNewPostsTask } =
      jest.requireActual<typeof import('@/notifications/background-check')>('@/notifications/background-check');
    defineNewPostsTask();
    let result: unknown;
    await rt.act(async () => {
      result = await rt.taskManager.run(TASK);
    });
    return result;
  };

  it('notifies about posts released since notifications were turned on', async () => {
    await launchWithNotifications();
    await rt.until(() => expect(rt.secureStore.has('sinkplane.notifications.seen')).toBe(true));

    const fresh = makeVideo(techCreator, techMainChannel, {
      id: 'fresh-post',
      title: 'Fresh Upload',
      releaseDate: new Date(Date.now() + 60_000).toISOString(),
    });
    rt.api.setChannelVideos(techCreator.id, techMainChannel.id, [fresh, ...rt.api.channelVideos(techMainChannel.id)]);

    expect(await runCheck()).toBe(1); // BackgroundTaskResult.Success
    expect(presented()).toHaveLength(1);
    expect(presented()[0].content).toMatchObject({
      title: 'New post from Tech Channel',
      body: 'Fresh Upload',
      data: { postId: 'fresh-post' },
    });

    // Nothing new on the next run.
    await runCheck();
    expect(presented()).toHaveLength(1);
  });

  it('does nothing once signed out', async () => {
    await launchWithNotifications();
    await rt.selectTab('settings');
    await rt.fireEvent.press(settingsTab().getByText('Sign Out'));
    await rt.until(() => expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy());

    await rt.until(() => expect(rt.secureStore.has('sinkplane.notifications.session')).toBe(false));
    expect(rt.taskManager.registered.has(TASK)).toBe(false);
    expect(rt.socket.connected()).toHaveLength(0);

    const before = rt.api.requests.length;
    await runCheck();
    expect(rt.api.requests.length).toBe(before);
  });
});

describe('settings', () => {
  it('lists Floatplane’s per-creator switches and saves changes', async () => {
    await launchWithNotifications();
    await openSettings();

    await rt.until(() => expect(settingsTab().getByLabelText('Notifications for Tech Channel')).toBeTruthy());
    expect(settingsTab().getByTestId('notifications-switch').props.value).toBe(true);
    expect(settingsTab().getByLabelText('Notifications for Tech Channel').props.value).toBe(true);
    expect(settingsTab().getByLabelText('Emails for Gaming Channel').props.value).toBe(false);

    await rt.fireEvent(settingsTab().getByLabelText('Notifications for Tech Channel'), 'valueChange', false);
    await rt.until(() => expect(rt.api.notificationSettingFor(techCreator.id).contentFirebase).toBe(false));
    expect(settingsTab().getByLabelText('Notifications for Tech Channel').props.value).toBe(false);

    await rt.fireEvent(settingsTab().getByLabelText('Emails for Gaming Channel'), 'valueChange', true);
    await rt.until(() => expect(rt.api.notificationSettingFor(gamingCreator.id).contentEmail).toBe(true));
    expect(rt.api.requestsTo('/api/v3/user/notification/update', 'POST').map(req => req.body)).toEqual([
      { creator: techCreator.id, property: 'contentFirebase', newValue: false },
      { creator: gamingCreator.id, property: 'contentEmail', newValue: true },
    ]);
  });

  it('rolls a switch back when Floatplane refuses the change', async () => {
    await launchWithNotifications();
    await openSettings();
    await rt.until(() => expect(settingsTab().getByLabelText('Notifications for Tech Channel')).toBeTruthy());

    rt.api.failRequests('POST', '/api/v3/user/notification/update', { status: 500, body: 'nope' });
    await rt.fireEvent(settingsTab().getByLabelText('Notifications for Tech Channel'), 'valueChange', false);

    await rt.until(() => expect(settingsTab().getByText('Couldn’t save that change. Please try again.')).toBeTruthy());
    expect(settingsTab().getByLabelText('Notifications for Tech Channel').props.value).toBe(true);
  });

  it('turning notifications off closes the socket and cancels the background check', async () => {
    await launchWithNotifications();
    await rt.until(() => expect(rt.taskManager.registered.has(TASK)).toBe(true));
    await openSettings();

    await rt.fireEvent(settingsTab().getByTestId('notifications-switch'), 'valueChange', false);

    await rt.until(() => expect(rt.socket.connected()).toHaveLength(0));
    await rt.until(() => expect(rt.taskManager.registered.has(TASK)).toBe(false));
    expect(rt.secureStore.get('sinkplane.notifications.enabled')).toBe('false');
    expect(settingsTab().queryByLabelText('Notifications for Tech Channel')).toBeNull();

    await rt.fireEvent(settingsTab().getByTestId('notifications-switch'), 'valueChange', true);
    await rt.until(() => expect(rt.socket.connected()).toHaveLength(1));
    await rt.until(() => expect(rt.taskManager.registered.has(TASK)).toBe(true));
  });

  it('points at system settings when notifications are blocked', async () => {
    rt.notifications.mockNotifications.setPermission('denied');
    rt.secureStore.set('sinkplane.notifications.enabled', 'false');
    await launch();
    await openSettings();

    await rt.until(() => expect(settingsTab().getByText('Notifications are turned off for Sinkplane in system settings.')).toBeTruthy());
    expect(settingsTab().getByTestId('notifications-switch').props.value).toBe(false);

    // Trying to turn it on can't prompt again: it stays off.
    await rt.fireEvent(settingsTab().getByTestId('notifications-switch'), 'valueChange', true);
    expect(rt.notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(settingsTab().getByTestId('notifications-switch').props.value).toBe(false);

    const openSettingsSpy = jest.spyOn(rt.linking, 'openSettings').mockResolvedValue(undefined);
    await rt.fireEvent.press(settingsTab().getByText('Open Settings'));
    expect(openSettingsSpy).toHaveBeenCalled();
  });

  it('offers a retry when the creator settings fail to load', async () => {
    // The first load and both of react-query's retries fail.
    rt.api.failRequests('GET', '/api/v3/user/notification/list', { status: 500, body: 'down' }, 3);
    await launchWithNotifications();
    await openSettings();

    await rt.until(() => expect(settingsTab().getByText('Couldn’t load creator settings. Tap to retry.')).toBeTruthy(), {
      maxFakeMs: 20_000,
    });
    await rt.fireEvent.press(settingsTab().getByText('Couldn’t load creator settings. Tap to retry.'));
    await rt.until(() => expect(settingsTab().getByLabelText('Notifications for Tech Channel')).toBeTruthy());
  });
});

describe('sync connection edge cases', () => {
  it('stops trying when the socket service rejects the session', async () => {
    rt.socket.rejectTokens = true;
    rt.notifications.mockNotifications.setPermission('granted');
    rt.secureStore.set('sinkplane.notifications.enabled', 'true');
    await launch();

    await rt.until(() => expect(rt.socket.sockets).toHaveLength(1));
    await rt.until(() => expect(rt.socket.sockets[0].closed).toBe(true));
    await rt.advanceTime(120_000);
    expect(rt.socket.sockets).toHaveLength(1);
  });

  it('retries a failed sync setup and recovers', async () => {
    rt.socket.connectStatus = 500;
    rt.notifications.mockNotifications.setPermission('granted');
    rt.secureStore.set('sinkplane.notifications.enabled', 'true');
    await launch();
    await rt.until(() => expect(rt.socket.sockets.length).toBeGreaterThanOrEqual(1));

    rt.socket.connectStatus = null;
    await rt.advanceTime(5_000);
    await rt.until(() => expect(rt.socket.connected()).toHaveLength(1));
  });

  it('keeps the connection alive with pings and replaces a dead one', async () => {
    await launchWithNotifications();
    const [first] = rt.socket.connected();

    await rt.advanceTime(25_000);
    expect(first.sent).toContain('2');
    expect(first.closed).toBe(false);

    rt.socket.silent = true;
    await rt.advanceTime(25_000 * 4);
    expect(first.closed).toBe(true);
    rt.socket.silent = false;
    await rt.until(() => expect(rt.socket.connected()).toHaveLength(1), { maxFakeMs: 60_000, stepMs: 500 });
  });

  it('reconnects when the server closes the session', async () => {
    await launchWithNotifications();

    rt.socket.broadcast('41');
    await rt.advanceTime(1_500);
    await rt.until(() => expect(rt.socket.connected()).toHaveLength(1));
    rt.socket.broadcast('1');
    await rt.advanceTime(3_000);
    await rt.until(() => expect(rt.socket.connected()).toHaveLength(1));
    expect(rt.socket.sockets).toHaveLength(3);
  });

  it('ignores noise on the socket', async () => {
    await launchWithNotifications();

    rt.socket.broadcast('6');
    rt.socket.broadcast('42[not json');
    rt.socket.broadcast('42{"not":"a list"}');
    rt.socket.broadcast('42["somethingElse",{}]');
    rt.socket.emit('userPhotoUpdated', { path: 'x' });
    rt.socket.emit('creatorNotification', null);
    rt.socket.emit('creatorNotification', { eventType: 'CONTENT_POST_RELEASE', content: 'no-text' });
    await rt.advanceTime(500);
    expect(presented()).toHaveLength(0);
    expect(rt.socket.connected()).toHaveLength(1);
  });
});

describe('notification payloads', () => {
  it('finds the post in the target URL when the content id is missing', async () => {
    await launchWithNotifications();
    rt.socket.notifyPostRelease({
      title: 'New post',
      creator: techCreator.id,
      post: { title: 'From the post object' },
      target: { url: `https://www.floatplane.com/post/${POST_ID}` },
    });
    await rt.until(() => expect(presented()).toHaveLength(1));
    expect(presented()[0]).toMatchObject({ identifier: `post:${POST_ID}`, content: { body: 'From the post object' } });
  });

  it('shows other announcements without a link', async () => {
    await launchWithNotifications();
    rt.socket.emit('creatorNotification', { eventType: 'CONTENT_LIVESTREAM_START', id: 'live-1', title: 'Tech Channel is live' });
    await rt.until(() => expect(presented()).toHaveLength(1));
    expect(presented()[0]).toMatchObject({
      identifier: 'live-1',
      content: { title: 'Tech Channel is live', data: { url: null, postId: null } },
    });

    await rt.act(async () => rt.notifications.tapNotification({ postId: null }));
    await rt.advanceTime(200);
    expect(rt.screen.queryByTestId('video-screen')).toBeNull();
  });

  it('notifies anyway when the creator settings are unavailable', async () => {
    rt.api.failRequests('GET', '/api/v3/user/notification/list', { status: 500, body: 'down' }, 3);
    await launchWithNotifications();
    rt.socket.notifyPostRelease({ message: 'Untitled', creator: 'creator-unknown', content: 'p-unknown' });
    rt.socket.notifyPostRelease({ title: 'No creator', message: 'x', content: 'p-none' });
    await rt.until(() =>
      expect(
        presented()
          .map(n => n.identifier)
          .sort(),
      ).toEqual(['post:p-none', 'post:p-unknown']),
    );
    expect(presented().find(n => n.identifier === 'post:p-unknown')?.content.title).toBe('Floatplane');
  });
});

describe('background check edge cases', () => {
  const runCheck = async () => {
    const { defineNewPostsTask } =
      jest.requireActual<typeof import('@/notifications/background-check')>('@/notifications/background-check');
    defineNewPostsTask();
    let result: unknown;
    await rt.act(async () => {
      result = await rt.taskManager.run(TASK);
    });
    return result;
  };
  const released = (id: string, offsetMs: number) =>
    makeVideo(techCreator, techMainChannel, { id, title: id, releaseDate: new Date(Date.now() + offsetMs).toISOString() });

  it('starts a baseline on the first run and caps a burst', async () => {
    await launchWithNotifications();
    rt.secureStore.delete('sinkplane.notifications.seen');
    await runCheck();
    expect(presented()).toHaveLength(0);

    const burst = Array.from({ length: 7 }, (_, i) => released(`burst-${i}`, (i + 1) * 60_000));
    rt.api.setChannelVideos(techCreator.id, techMainChannel.id, [...burst].reverse());
    await rt.advanceTime(10 * 60_000);
    await runCheck();
    expect(presented()).toHaveLength(5);
  });

  it('checks the other creators when one fails, and skips muted ones', async () => {
    await launchWithNotifications();
    await rt.until(() => expect(rt.secureStore.has('sinkplane.notifications.seen')).toBe(true));
    rt.api.notificationSettings.set(gamingCreator.id, { contentFirebase: false, contentEmail: false });
    rt.api.setChannelVideos(techCreator.id, techMainChannel.id, [released('tech-new', 60_000)]);
    rt.api.failRequests('GET', '/api/v3/content/creator', { status: 500, body: 'down' });
    const before = rt.api.requests.length;

    await runCheck();
    expect(presented()).toHaveLength(0);
    await runCheck();
    expect(presented().map(n => n.identifier)).toEqual(['post:tech-new']);
    // The muted creator was never fetched.
    const checked = rt.api.requests.slice(before).filter(req => req.path === '/api/v3/content/creator');
    expect(checked.map(req => req.params.get('id'))).toEqual([techCreator.id, techCreator.id]);
  });

  it('reports a failed run when Floatplane is unreachable', async () => {
    await launchWithNotifications();
    rt.api.failRequests('GET', '/api/v3/user/notification/list', { status: 500, body: 'down' });
    expect(await runCheck()).toBe(2); // BackgroundTaskResult.Failed
  });

  it('skips scheduling when background work is restricted', async () => {
    rt.backgroundTask.status = 1; // BackgroundTaskStatus.Restricted
    await launchWithNotifications();
    await rt.advanceTime(500);
    expect(rt.taskManager.registered.has(TASK)).toBe(false);
  });
});
