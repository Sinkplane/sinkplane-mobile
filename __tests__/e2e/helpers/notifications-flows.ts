/**
 * Shared flows for the notification E2E suites (notifications-sync / -settings / -background):
 * launching with or without notifications on, reading presented notifications, opening Settings,
 * and running the background check like the OS would.
 */
import type * as BackgroundCheck from '@/notifications/background-check';

import type { MockServerSocket } from './mock-floatplane-socket';
import type { Runtime } from './runtime';

export const TASK = 'sinkplane-new-posts';
export const POST_ID = 'ch-tech-main-01';

type Presented = Runtime['notifications']['mockNotifications']['presented'];

export const settingsTab = (rt: Runtime): ReturnType<Runtime['inTab']> => rt.inTab('settings');
export const presented = (rt: Runtime): Presented => rt.notifications.mockNotifications.presented;

/** The one authenticated sync socket (fails the test when there is none). */
export function connectedSocket(rt: Runtime): MockServerSocket {
  const [socket] = rt.socket.connected();
  if (!socket) {
    throw new Error('No connected sync socket');
  }
  return socket;
}

/** Launch signed in; returns the session token. */
export async function launch(rt: Runtime): Promise<string> {
  const token = rt.seedSession();
  await rt.renderApp();
  await rt.until(() => {
    expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();
  });
  return token;
}

/** Launch signed in with notifications already on (permission granted earlier). */
export async function launchWithNotifications(rt: Runtime): Promise<string> {
  rt.notifications.mockNotifications.setPermission('granted');
  rt.secureStore.set('sinkplane.notifications.enabled', 'true');
  const token = await launch(rt);
  await rt.until(() => {
    expect(rt.socket.connected()).toHaveLength(1);
  });
  return token;
}

export async function openSettings(rt: Runtime): Promise<void> {
  await rt.selectTab('settings');
  await rt.until(() => {
    expect(rt.selectedTab()).toBe('settings');
  });
}

/** Run the background check the way the OS would; resolves to the task's result. */
export async function runCheck(rt: Runtime): Promise<unknown> {
  // The entry file defines the task body; here the app modules come from the test's registry.
  const { defineNewPostsTask } = jest.requireActual<typeof BackgroundCheck>(
    '@/notifications/background-check',
  );
  defineNewPostsTask();
  let result: unknown;
  await rt.act(async () => {
    result = await rt.taskManager.run(TASK);
  });
  return result;
}
