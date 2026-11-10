/**
 * E2E: new-post notifications — sync socket connection edge cases (rejected sessions, retries,
 * pings, server closes, noise) and the notification payloads the app understands.
 */
import { techCreator } from '@test/fixtures';

import {
  connectedSocket,
  launch,
  launchWithNotifications,
  POST_ID,
  presented,
} from './helpers/notifications-flows';
import { loadRuntime, type Runtime } from './helpers/runtime';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

/** Identifiers of the presented notifications, sorted. */
function sortedIdentifiers(runtime: Runtime): string[] {
  return presented(runtime)
    .map((n) => n.identifier ?? '')
    .sort((a, b) => a.localeCompare(b));
}

describe('sync connection edge cases', () => {
  it('stops trying when the socket service rejects the session', async () => {
    rt.socket.rejectTokens = true;
    rt.notifications.mockNotifications.setPermission('granted');
    rt.secureStore.set('sinkplane.notifications.enabled', 'true');
    await launch(rt);

    await rt.until(() => {
      expect(rt.socket.sockets).toHaveLength(1);
    });
    await rt.until(() => {
      expect(rt.socket.sockets[0]?.closed).toBe(true);
    });
    await rt.advanceTime(120_000);
    expect(rt.socket.sockets).toHaveLength(1);
  });

  it('retries a failed sync setup and recovers', async () => {
    rt.socket.connectStatus = 500;
    rt.notifications.mockNotifications.setPermission('granted');
    rt.secureStore.set('sinkplane.notifications.enabled', 'true');
    await launch(rt);
    await rt.until(() => {
      expect(rt.socket.sockets.length).toBeGreaterThanOrEqual(1);
    });

    rt.socket.connectStatus = null;
    await rt.advanceTime(5_000);
    await rt.until(() => {
      expect(rt.socket.connected()).toHaveLength(1);
    });
  });

  it('keeps the connection alive with pings and replaces a dead one', async () => {
    await launchWithNotifications(rt);
    const first = connectedSocket(rt);

    await rt.advanceTime(25_000);
    expect(first.sent).toContain('2');
    expect(first.closed).toBe(false);

    rt.socket.silent = true;
    await rt.advanceTime(25_000 * 4);
    expect(first.closed).toBe(true);
    rt.socket.silent = false;
    await rt.until(
      () => {
        expect(rt.socket.connected()).toHaveLength(1);
      },
      {
        maxFakeMs: 60_000,
        stepMs: 500,
      },
    );
  });

  it('reconnects when the server closes the session', async () => {
    await launchWithNotifications(rt);

    rt.socket.broadcast('41');
    await rt.advanceTime(1_500);
    await rt.until(() => {
      expect(rt.socket.connected()).toHaveLength(1);
    });
    rt.socket.broadcast('1');
    await rt.advanceTime(3_000);
    await rt.until(() => {
      expect(rt.socket.connected()).toHaveLength(1);
    });
    expect(rt.socket.sockets).toHaveLength(3);
  });

  it('ignores noise on the socket', async () => {
    await launchWithNotifications(rt);

    rt.socket.broadcast('6');
    rt.socket.broadcast('42[not json');
    rt.socket.broadcast('42{"not":"a list"}');
    rt.socket.broadcast('42["somethingElse",{}]');
    rt.socket.emit('userPhotoUpdated', { path: 'x' });
    rt.socket.emit('creatorNotification', null);
    rt.socket.emit('creatorNotification', {
      eventType: 'CONTENT_POST_RELEASE',
      content: 'no-text',
    });
    await rt.advanceTime(500);
    expect(presented(rt)).toHaveLength(0);
    expect(rt.socket.connected()).toHaveLength(1);
  });
});

describe('notification payloads', () => {
  it('finds the post in the target URL when the content id is missing', async () => {
    await launchWithNotifications(rt);
    rt.socket.notifyPostRelease({
      title: 'New post',
      creator: techCreator.id,
      post: { title: 'From the post object' },
      target: { url: `https://www.floatplane.com/post/${POST_ID}` },
    });
    await rt.until(() => {
      expect(presented(rt)).toHaveLength(1);
    });
    expect(presented(rt)[0]).toMatchObject({
      identifier: `post:${POST_ID}`,
      content: { body: 'From the post object' },
    });
  });

  it('shows other announcements without a link', async () => {
    await launchWithNotifications(rt);
    rt.socket.emit('creatorNotification', {
      eventType: 'CONTENT_LIVESTREAM_START',
      id: 'live-1',
      title: 'Tech Channel is live',
    });
    await rt.until(() => {
      expect(presented(rt)).toHaveLength(1);
    });
    expect(presented(rt)[0]).toMatchObject({
      identifier: 'live-1',
      content: { title: 'Tech Channel is live', data: { url: null, postId: null } },
    });

    await rt.act(() => {
      rt.notifications.tapNotification({ postId: null });
    });
    await rt.advanceTime(200);
    expect(rt.screen.queryByTestId('video-screen')).toBeNull();
  });

  it('notifies anyway when the creator settings are unavailable', async () => {
    rt.api.failRequests(
      'GET /api/v3/user/notification/list',
      { status: 500, body: 'down' },
      { count: 3 },
    );
    await launchWithNotifications(rt);
    rt.socket.notifyPostRelease({
      message: 'Untitled',
      creator: 'creator-unknown',
      content: 'p-unknown',
    });
    rt.socket.notifyPostRelease({ title: 'No creator', message: 'x', content: 'p-none' });
    await rt.until(() => {
      expect(sortedIdentifiers(rt)).toEqual(['post:p-none', 'post:p-unknown']);
    });
    expect(presented(rt).find((n) => n.identifier === 'post:p-unknown')?.content.title).toBe(
      'Floatplane',
    );
  });
});
