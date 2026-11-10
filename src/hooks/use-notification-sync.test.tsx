import type { ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useNotificationSync } from '@/hooks/use-notification-sync';
import { NEW_POSTS_TASK } from '@/notifications/background-check';
import type { FloatplaneSocketOptions } from '@/notifications/floatplane-socket';
import {
  getBackgroundSession,
  loadSeenState,
  markSeen,
  setBackgroundSession,
  setNotificationsEnabled,
} from '@/notifications/notification-store';
import {
  BackgroundTaskStatus,
  mockBackgroundTask,
  registerTaskAsync,
} from '@test/mocks/expo-background-task';
import {
  mockNotifications,
  requestPermissionsAsync,
  scheduleNotificationAsync,
} from '@test/mocks/expo-notifications';
import { mockTaskManager } from '@test/mocks/expo-task-manager';

// ---------------------------------------------------------------------------
// Fakes: the socket (the protocol has its own tests), the pathname, AppState.
// ---------------------------------------------------------------------------

interface FakeSocket {
  options: FloatplaneSocketOptions;
  connect: jest.Mock;
  close: jest.Mock;
}

const mockSockets: FakeSocket[] = [];
jest.mock('@/notifications/floatplane-socket', () => {
  const className = 'FloatplaneSocket';
  return {
    [className]: jest.fn().mockImplementation((options: FloatplaneSocketOptions) => {
      const socket = { options, connect: jest.fn(), close: jest.fn() };
      mockSockets.push(socket);
      return socket;
    }),
  };
});

/** The `index`-th socket the hook opened (negative: from the end). */
function socketAt(index: number): FakeSocket {
  const socket = mockSockets.at(index);
  if (!socket) {
    throw new Error(`no socket #${String(index)}`);
  }
  return socket;
}

let mockPathname = '/';
jest.mock('expo-router', () => ({ usePathname: () => mockPathname }));

let appStateListeners: ((state: AppStateStatus) => void)[];
const setAppState = (state: AppStateStatus) =>
  act(() => {
    appStateListeners.forEach((listener) => {
      listener(state);
    });
  });

let creatorSettings: unknown;
function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

const fakeResponse = (status: number, body: unknown, text: string) =>
  ({
    ok: status === 200,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(text),
  }) as Response;

const fetchMock = jest.fn((input: RequestInfo | URL) => {
  if (urlOf(input).includes('/user/notification/list')) {
    if (creatorSettings instanceof Error) {
      return Promise.reject(creatorSettings);
    }
    return Promise.resolve(fakeResponse(200, creatorSettings, ''));
  }
  return Promise.resolve(fakeResponse(404, {}, 'no mock'));
});

let queryClient: QueryClient;

beforeEach(() => {
  mockSockets.length = 0;
  mockPathname = '/';
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListeners.push(listener);
    return {
      remove: () => (appStateListeners = appStateListeners.filter((l) => l !== listener)),
    };
  });
  creatorSettings = [
    { creator: { id: 'c-on', title: 'On' }, userNotificationSetting: { contentFirebase: true } },
    { creator: { id: 'c-off', title: 'Off' }, userNotificationSetting: { contentFirebase: false } },
  ];
  fetchMock.mockClear();
  globalThis.fetch = fetchMock as typeof fetch;
  // gcTime: Infinity — no garbage-collection timers left running after a test unmounts.
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
});

afterEach(() => {
  queryClient.clear();
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

interface SyncProps {
  token: string | null | undefined;
  loading?: boolean;
}

async function renderSync(props: SyncProps = { token: 'tok' }) {
  return renderHook(
    ({ token, loading }: SyncProps) => {
      useNotificationSync(token, loading ?? false);
    },
    { wrapper, initialProps: props },
  );
}

async function renderActive() {
  mockNotifications.setPermission('granted');
  await setNotificationsEnabled(true);
  const hook = await renderSync();
  await waitFor(() => {
    expect(mockSockets).toHaveLength(1);
  });
  return hook;
}

const emit = async (event: string, data: unknown) => {
  await act(() => {
    socketAt(-1).options.onSyncEvent(event, data);
  });
};

const presentedIds = () => mockNotifications.presented.map((n) => n.identifier);

const release = (content: string, creator = 'c-on') => ({
  eventType: 'CONTENT_POST_RELEASE',
  title: 'New post',
  message: `Post ${content}`,
  creator,
  content,
});

describe('live socket', () => {
  it('connects with the session token and shows new posts', async () => {
    await renderActive();
    expect(socketAt(0).options.token).toBe('tok');
    expect(socketAt(0).connect).toHaveBeenCalled();

    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    await emit('creatorNotification', release('p1'));
    await waitFor(() => {
      expect(mockNotifications.presented).toHaveLength(1);
    });
    expect(mockNotifications.presented[0]).toMatchObject({
      identifier: 'post:p1',
      content: { body: 'Post p1' },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['videos-infinite'] });
  });

  it('ignores other events and payloads with nothing to show', async () => {
    await renderActive();
    await emit('userPhotoUpdated', {});
    await emit('creatorNotification', null);
    await waitFor(() => {
      expect(fetchMock).not.toHaveBeenCalled();
    });
    expect(mockNotifications.presented).toHaveLength(0);
  });

  it('respects the per-creator switch, defaulting to on', async () => {
    await renderActive();
    await emit('creatorNotification', release('muted', 'c-off'));
    await emit('creatorNotification', release('unknown', 'c-new'));
    await emit('creatorNotification', { ...release('nocreator'), creator: undefined });
    await waitFor(() => {
      expect(presentedIds()).toEqual(['post:unknown', 'post:nocreator']);
    });
  });

  it('still notifies when the creator settings cannot be loaded', async () => {
    creatorSettings = new Error('offline');
    await renderActive();
    await emit('creatorNotification', release('p1'));
    await waitFor(() => {
      expect(mockNotifications.presented).toHaveLength(1);
    });
  });

  it('only records a post the user is already looking at', async () => {
    mockPathname = '/video/p1';
    await renderActive();
    await emit('creatorNotification', release('p1'));
    await waitFor(async () => {
      expect((await loadSeenState())?.ids).toEqual(['post:p1']);
    });
    expect(mockNotifications.presented).toHaveLength(0);
  });

  it('logs when a notification cannot be shown', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockNotifications.setPermission('granted');
    await renderActive();
    scheduleNotificationAsync.mockRejectedValueOnce(new Error('nope'));
    await emit('creatorNotification', release('p1'));
    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        '[Notifications] Could not show a notification:',
        expect.any(Error),
      );
    });
  });

  it('disconnects in the background and reconnects in the foreground', async () => {
    const { unmount } = await renderActive();

    await setAppState('background');
    expect(socketAt(0).close).toHaveBeenCalled();
    await setAppState('active');
    await waitFor(() => {
      expect(mockSockets).toHaveLength(2);
    });

    await unmount();
    expect(socketAt(1).close).toHaveBeenCalled();
  });

  it('does not connect while notifications are off', async () => {
    mockNotifications.setPermission('granted');
    await setNotificationsEnabled(false);
    await renderSync();
    await waitFor(() => {
      expect(mockTaskManager.registered.has(NEW_POSTS_TASK)).toBe(false);
    });
    expect(mockSockets).toHaveLength(0);
  });
});

describe('session and background check', () => {
  it('mirrors the token and schedules the background check', async () => {
    await renderActive();
    await waitFor(() => {
      expect(mockTaskManager.registered.has(NEW_POSTS_TASK)).toBe(true);
    });
    expect(await getBackgroundSession()).toBe('tok');
    expect(await loadSeenState()).toMatchObject({ ids: [] });
  });

  it('logs when the background check cannot be scheduled', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    registerTaskAsync.mockRejectedValueOnce(new Error('denied'));
    await renderActive();
    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        '[Notifications] Could not schedule the background check:',
        expect.any(Error),
      );
    });
  });

  it('cancels the check when notifications are switched off', async () => {
    mockTaskManager.registered.set(NEW_POSTS_TASK, {});
    await setNotificationsEnabled(false);
    await renderSync();
    await waitFor(() => {
      expect(mockTaskManager.registered.has(NEW_POSTS_TASK)).toBe(false);
    });
  });

  it('forgets the session on sign-out, but not while the session is still loading', async () => {
    mockBackgroundTask.status = BackgroundTaskStatus.Available;
    await setBackgroundSession('old');
    await markSeen('post:x');
    mockTaskManager.registered.set(NEW_POSTS_TASK, {});

    const { rerender } = await renderSync({ token: undefined, loading: true });
    await act(() => undefined);
    expect(await getBackgroundSession()).toBe('old');

    await rerender({ token: null, loading: false });
    await waitFor(async () => {
      expect(await getBackgroundSession()).toBeNull();
    });
    expect(await loadSeenState()).toBeNull();
    expect(mockTaskManager.registered.has(NEW_POSTS_TASK)).toBe(false);
  });
});

describe('first launch', () => {
  it('asks for permission once when signed in', async () => {
    const { rerender } = await renderSync();
    await waitFor(() => {
      expect(mockSockets).toHaveLength(1);
    });
    expect(requestPermissionsAsync).toHaveBeenCalledTimes(1);

    await rerender({ token: 'tok' });
    expect(requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('does not ask while signed out', async () => {
    await renderSync({ token: null });
    await act(() => undefined);
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('swallows a failing prompt', async () => {
    requestPermissionsAsync.mockRejectedValueOnce(new Error('no UI'));
    await renderSync();
    await waitFor(() => {
      expect(requestPermissionsAsync).toHaveBeenCalled();
    });
    expect(mockSockets).toHaveLength(0);
  });
});
