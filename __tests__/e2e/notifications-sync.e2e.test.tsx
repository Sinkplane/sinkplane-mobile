/**
 * E2E: new-post notifications — the permission prompt on first launch, live notifications from
 * Floatplane's sync socket, and tapping a notification (running and cold start).
 */
import { gamingCreator, techCreator } from '@test/fixtures';

import {
  connectedSocket,
  launch,
  launchWithNotifications,
  POST_ID,
  presented,
  TASK,
} from './helpers/notifications-flows';
import { loadRuntime, type Runtime } from './helpers/runtime';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

describe('first launch', () => {
  it('asks for permission once signed in, then connects and schedules the background check', async () => {
    const token = await launch(rt);

    await rt.until(() => {
      expect(rt.socket.connected()).toHaveLength(1);
    });
    expect(rt.notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(rt.secureStore.get('sinkplane.notifications.enabled')).toBe('true');

    // Token-mode sync session, with the browser User-Agent Cloudflare requires.
    const socket = connectedSocket(rt);
    expect(socket.token).toBe(token);
    expect(socket.url).toContain('EIO=3&transport=websocket');
    expect(socket.headers['User-Agent']).toMatch(/^Mozilla\/5\.0/);

    await rt.until(() => {
      expect(rt.taskManager.registered.get(TASK)).toEqual({ minimumInterval: 15 });
    });
    // The background check gets its own copy of the session.
    expect(rt.secureStore.get('sinkplane.notifications.session')).toBe(token);
  });

  it('stays off without a socket when the permission is refused', async () => {
    rt.notifications.mockNotifications.promptAnswer = 'denied';
    await launch(rt);

    await rt.until(() => {
      expect(rt.secureStore.get('sinkplane.notifications.enabled')).toBe('false');
    });
    await rt.advanceTime(1000);
    expect(rt.socket.sockets).toHaveLength(0);
    expect(rt.taskManager.registered.has(TASK)).toBe(false);
  });

  it('does not prompt on the sign-in screen', async () => {
    await rt.renderApp();
    await rt.until(() => {
      expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy();
    });
    await rt.advanceTime(500);
    expect(rt.notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('live notifications', () => {
  it('shows a notification for a new post and opens the video when tapped', async () => {
    await launchWithNotifications(rt);

    rt.socket.notifyPostRelease({
      title: 'New post from Tech Channel',
      message: 'Main Channel Video 01',
      creator: techCreator.id,
      content: POST_ID,
    });
    await rt.until(() => {
      expect(presented(rt)).toHaveLength(1);
    });
    expect(presented(rt)[0]).toMatchObject({
      identifier: `post:${POST_ID}`,
      content: {
        title: 'New post from Tech Channel',
        body: 'Main Channel Video 01',
        data: { postId: POST_ID, url: `/video/${POST_ID}` },
      },
    });

    await rt.act(() => {
      rt.notifications.tapNotification({ postId: POST_ID });
    });
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-title')).toHaveTextContent('Main Channel Video 01');
    });
  });

  it('shows each post once, even when announced again', async () => {
    await launchWithNotifications(rt);
    const announce = () => {
      rt.socket.notifyPostRelease({
        title: 'New post',
        message: 'Hi',
        creator: techCreator.id,
        content: POST_ID,
      });
    };

    announce();
    await rt.until(() => {
      expect(presented(rt)).toHaveLength(1);
    });
    announce();
    await rt.advanceTime(500);
    expect(presented(rt)).toHaveLength(1);
  });

  it('skips creators whose notifications are switched off on Floatplane', async () => {
    rt.api.notificationSettings.set(techCreator.id, {
      contentFirebase: false,
      contentEmail: false,
    });
    await launchWithNotifications(rt);

    rt.socket.notifyPostRelease({
      title: 'Muted',
      message: 'Nope',
      creator: techCreator.id,
      content: POST_ID,
    });
    rt.socket.notifyPostRelease({
      title: 'New post from Gaming',
      message: 'Yes',
      creator: gamingCreator.id,
      content: 'gaming-post',
    });

    await rt.until(() => {
      expect(presented(rt)).toHaveLength(1);
    });
    expect(presented(rt)[0]?.content.title).toBe('New post from Gaming');
  });

  it('does not notify about the post the user is already watching', async () => {
    await launchWithNotifications(rt);
    await rt.fireEvent.press(rt.screen.getByTestId(`video-list-item-${POST_ID}`));
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-screen')).toBeTruthy();
    });

    rt.socket.notifyPostRelease({
      title: 'New post',
      message: 'This one',
      creator: techCreator.id,
      content: POST_ID,
    });
    await rt.advanceTime(500);
    expect(presented(rt)).toHaveLength(0);
  });

  it('reconnects after the connection drops', async () => {
    await launchWithNotifications(rt);

    connectedSocket(rt).drop();
    await rt.advanceTime(1500);
    await rt.until(() => {
      expect(rt.socket.connected()).toHaveLength(1);
    });
    expect(rt.socket.sockets).toHaveLength(2);
  });
});

describe('opening from a notification', () => {
  it('opens the video when a tap launched the app', async () => {
    rt.notifications.mockNotifications.setPermission('granted');
    rt.notifications.mockNotifications.lastResponse = rt.notifications.makeResponse({
      postId: POST_ID,
    });
    rt.seedSession();
    await rt.renderApp();

    await rt.until(() => {
      expect(rt.screen.getByTestId('video-title')).toHaveTextContent('Main Channel Video 01');
    });
    expect(rt.notifications.mockNotifications.lastResponse).toBeNull();
  });

  it('ignores taps on notifications without a post', async () => {
    await launchWithNotifications(rt);

    await rt.act(() => {
      rt.notifications.tapNotification({ url: null });
    });
    await rt.advanceTime(200);
    expect(rt.screen.queryByTestId('video-screen')).toBeNull();
  });
});
