import type { ReactNode } from 'react';
import { AppState, Linking, type AppStateStatus } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { getNotificationsEnabled, loadSeenState, saveSeenState, setNotificationsEnabled } from '@/notifications/notification-store';
import { mockNotifications, requestPermissionsAsync } from '@test/mocks/expo-notifications';

// ---------------------------------------------------------------------------
// In-memory /api/v3/user/notification/{list,update}.
// ---------------------------------------------------------------------------

interface Entry {
  creator: { id: string; title: string; icon?: { path: string } | null };
  userNotificationSetting: { contentFirebase: boolean; contentEmail: boolean };
}

let entries: Entry[];
let listFailures: number;
let updateFails: boolean;
let updates: unknown[];

const respond = (status: number, body: unknown) =>
  ({ ok: status === 200, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;

const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = new URL(String(input)).pathname;
  if (path === '/api/v3/user/notification/list') {
    if (listFailures > 0) {
      listFailures -= 1;
      return respond(500, 'down');
    }
    return respond(200, entries);
  }
  if (path === '/api/v3/user/notification/update') {
    const update = JSON.parse(String(init?.body)) as { creator: string; property: 'contentFirebase' | 'contentEmail'; newValue: boolean };
    updates.push(update);
    if (updateFails) return respond(500, 'nope');
    const entry = entries.find(e => e.creator.id === update.creator);
    if (entry) entry.userNotificationSetting[update.property] = update.newValue;
    return respond(200, {});
  }
  return respond(404, 'no mock');
});

let appStateListeners: ((state: AppStateStatus) => void)[];
let queryClient: QueryClient;

beforeEach(() => {
  entries = [
    {
      creator: { id: 'c1', title: 'LTT', icon: { path: 'https://pbs/ltt.jpg' } },
      userNotificationSetting: { contentFirebase: true, contentEmail: false },
    },
    { creator: { id: 'c2', title: 'GN', icon: null }, userNotificationSetting: { contentFirebase: false, contentEmail: true } },
  ];
  listFailures = 0;
  updateFails = false;
  updates = [];
  globalThis.fetch = fetchMock as typeof fetch;
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListeners.push(listener as (state: AppStateStatus) => void);
    return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
  });
  // gcTime: Infinity — no garbage-collection timers left running after a test unmounts.
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
});

afterEach(() => queryClient.clear());

function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

async function renderSettings(token: string | null = 'tok') {
  await render(
    <Providers>
      <NotificationSettings token={token} />
    </Providers>,
  );
}

const mainSwitch = () => screen.getByTestId('notifications-switch');

async function renderEnabled() {
  mockNotifications.setPermission('granted');
  await setNotificationsEnabled(true);
  await renderSettings();
  await waitFor(() => expect(screen.getByLabelText('Notifications for LTT')).toBeTruthy());
}

describe('main switch', () => {
  it('is off until enabled, and asks for permission when turned on', async () => {
    await renderSettings();
    await waitFor(() => expect(mainSwitch().props.disabled).toBe(false));
    expect(mainSwitch().props.value).toBe(false);

    await fireEvent(mainSwitch(), 'valueChange', true);
    await waitFor(() => expect(mainSwitch().props.value).toBe(true));
    expect(requestPermissionsAsync).toHaveBeenCalled();
    expect(await getNotificationsEnabled()).toBe(true);
    await waitFor(() => expect(screen.getByLabelText('Notifications for LTT')).toBeTruthy());
  });

  it('restarts the "new since" clock when turned on, keeping what was shown', async () => {
    await saveSeenState({ since: 1, checkedAt: 2, pending: { c1: 1 }, ids: ['post:a'] });
    await renderSettings();
    await waitFor(() => expect(mainSwitch().props.disabled).toBe(false));
    const before = Date.now();
    await fireEvent(mainSwitch(), 'valueChange', true);
    await waitFor(() => expect(mainSwitch().props.value).toBe(true));
    const state = await loadSeenState();
    expect(state).toMatchObject({ pending: {}, ids: ['post:a'] });
    expect(state?.since).toBeGreaterThanOrEqual(before);
    expect(state?.checkedAt).toBe(state?.since);
  });

  it('turns off and hides the creator list', async () => {
    await renderEnabled();
    await fireEvent(mainSwitch(), 'valueChange', false);
    await waitFor(() => expect(mainSwitch().props.value).toBe(false));
    expect(screen.queryByLabelText('Notifications for LTT')).toBeNull();
    expect(await getNotificationsEnabled()).toBe(false);
  });

  it('stays off and links to system settings when permission is refused', async () => {
    mockNotifications.promptAnswer = 'denied';
    await renderSettings();
    await waitFor(() => expect(mainSwitch().props.disabled).toBe(false));

    await fireEvent(mainSwitch(), 'valueChange', true);
    await waitFor(() => expect(screen.getByText('Notifications are turned off for Sinkplane in system settings.')).toBeTruthy());
    expect(mainSwitch().props.value).toBe(false);

    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await fireEvent.press(screen.getByText('Open Settings'));
    expect(openSettings).toHaveBeenCalled();
  });

  it('swallows a failing permission request', async () => {
    requestPermissionsAsync.mockRejectedValueOnce(new Error('no UI'));
    await renderSettings();
    await waitFor(() => expect(mainSwitch().props.disabled).toBe(false));
    await fireEvent(mainSwitch(), 'valueChange', true);
    await waitFor(() => expect(mainSwitch().props.disabled).toBe(false));
    expect(mainSwitch().props.value).toBe(false);
  });

  it('re-reads the permission when the app returns to the foreground', async () => {
    mockNotifications.setPermission('denied');
    await setNotificationsEnabled(true);
    await renderSettings();
    await waitFor(() => expect(screen.getByText('Open Settings')).toBeTruthy());

    // The user allowed notifications in system settings and came back.
    mockNotifications.setPermission('granted');
    await act(async () => appStateListeners.forEach(listener => listener('background')));
    expect(mainSwitch().props.value).toBe(false);
    await act(async () => appStateListeners.forEach(listener => listener('active')));
    await waitFor(() => expect(mainSwitch().props.value).toBe(true));
  });
});

describe('creator switches', () => {
  it('shows Floatplane’s settings per creator', async () => {
    await renderEnabled();
    expect(screen.getByLabelText('Notifications for LTT').props.value).toBe(true);
    expect(screen.getByLabelText('Emails for LTT').props.value).toBe(false);
    expect(screen.getByLabelText('Notifications for GN').props.value).toBe(false);
    expect(screen.getByLabelText('Emails for GN').props.value).toBe(true);
    expect(screen.getByText('Notify me')).toBeTruthy();
  });

  it('saves changes', async () => {
    await renderEnabled();
    await fireEvent(screen.getByLabelText('Notifications for GN'), 'valueChange', true);
    await fireEvent(screen.getByLabelText('Emails for LTT'), 'valueChange', true);

    await waitFor(() =>
      expect(updates).toEqual([
        { creator: 'c2', property: 'contentFirebase', newValue: true },
        { creator: 'c1', property: 'contentEmail', newValue: true },
      ]),
    );
    expect(screen.getByLabelText('Notifications for GN').props.value).toBe(true);
  });

  it('rolls back and explains a failed save', async () => {
    await renderEnabled();
    updateFails = true;
    await fireEvent(screen.getByLabelText('Notifications for LTT'), 'valueChange', false);
    await waitFor(() => expect(screen.getByText('Couldn’t save that change. Please try again.')).toBeTruthy());
    expect(screen.getByLabelText('Notifications for LTT').props.value).toBe(true);
  });

  it('offers a retry when the list fails to load', async () => {
    listFailures = 1;
    mockNotifications.setPermission('granted');
    await setNotificationsEnabled(true);
    await renderSettings();

    await waitFor(() => expect(screen.getByText('Couldn’t load creator settings. Tap to retry.')).toBeTruthy());
    await fireEvent.press(screen.getByText('Couldn’t load creator settings. Tap to retry.'));
    await waitFor(() => expect(screen.getByLabelText('Notifications for LTT')).toBeTruthy());
  });

  it('renders nothing for an empty list, and does not load without a session', async () => {
    entries = [];
    mockNotifications.setPermission('granted');
    await setNotificationsEnabled(true);
    await renderSettings();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText('Notify me')).toBeNull();
  });

  it('does not save without a session', async () => {
    mockNotifications.setPermission('granted');
    await setNotificationsEnabled(true);
    queryClient.setQueryData(
      ['notifications', 'creators', null],
      [{ creatorId: 'c1', title: 'LTT', iconUrl: null, contentFirebase: true, contentEmail: false }],
    );
    await renderSettings(null);
    await waitFor(() => expect(screen.getByLabelText('Notifications for LTT')).toBeTruthy());

    await fireEvent(screen.getByLabelText('Notifications for LTT'), 'valueChange', false);
    expect(updates).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
