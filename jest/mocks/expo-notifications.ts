/**
 * In-memory stand-in for expo-notifications (mapped in jest.config.base.js).
 *
 * `mockNotifications` holds the drivable state: the OS permission (and what a prompt answers),
 * presented notifications, the foreground handler, the launch response, and response listeners
 * (`tapNotification` simulates the user tapping one).
 */
import type * as Real from 'expo-notifications';

type PermissionStatus = Pick<Real.NotificationPermissionsStatus, 'granted' | 'status' | 'canAskAgain'> & {
  ios?: { status: number };
};

const permission = (status: 'granted' | 'denied' | 'undetermined', canAskAgain = status === 'undetermined'): PermissionStatus => ({
  granted: status === 'granted',
  status: status as PermissionStatus['status'],
  canAskAgain,
});

export const DEFAULT_ACTION_IDENTIFIER = 'expo.modules.notifications.actions.DEFAULT';
export const AndroidImportance = { DEFAULT: 3, HIGH: 4, MAX: 5 } as const;
export const IosAuthorizationStatus = { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 } as const;

type ResponseListener = (response: Real.NotificationResponse) => void;

export const mockNotifications = {
  permission: permission('undetermined'),
  /** What the OS permission prompt answers. */
  promptAnswer: 'granted' as 'granted' | 'denied',
  presented: [] as Real.NotificationRequestInput[],
  handler: null as Real.NotificationHandler | null,
  channels: new Map<string, unknown>(),
  lastResponse: null as Real.NotificationResponse | null,
  responseListeners: new Set<ResponseListener>(),

  setPermission(status: 'granted' | 'denied' | 'undetermined', canAskAgain?: boolean) {
    this.permission = permission(status, canAskAgain);
  },

  reset() {
    this.permission = permission('undetermined');
    this.promptAnswer = 'granted';
    this.presented = [];
    this.handler = null;
    this.channels.clear();
    this.lastResponse = null;
    this.responseListeners.clear();
  },
};

/** A response for a presented notification (or arbitrary data). */
export function makeResponse(data: Record<string, unknown>, actionIdentifier = DEFAULT_ACTION_IDENTIFIER): Real.NotificationResponse {
  return {
    actionIdentifier,
    notification: { date: 0, request: { identifier: 'n', content: { data }, trigger: null } },
  } as unknown as Real.NotificationResponse;
}

/** The user taps a notification while the app runs. */
export function tapNotification(data: Record<string, unknown>, actionIdentifier?: string): void {
  const response = makeResponse(data, actionIdentifier);
  mockNotifications.lastResponse = response;
  mockNotifications.responseListeners.forEach(listener => listener(response));
}

export const getPermissionsAsync = jest.fn(async () => mockNotifications.permission);

export const requestPermissionsAsync = jest.fn(async () => {
  if (mockNotifications.permission.status === 'undetermined') {
    mockNotifications.setPermission(mockNotifications.promptAnswer, false);
  }
  return mockNotifications.permission;
});

export const setNotificationHandler = jest.fn((handler: Real.NotificationHandler | null) => {
  mockNotifications.handler = handler;
});

export const setNotificationChannelAsync = jest.fn(async (id: string, channel: unknown) => {
  mockNotifications.channels.set(id, channel);
  return null;
});

export const scheduleNotificationAsync = jest.fn(async (request: Real.NotificationRequestInput) => {
  mockNotifications.presented.push(request);
  return request.identifier ?? `notification-${mockNotifications.presented.length}`;
});

export const getLastNotificationResponse = jest.fn(() => mockNotifications.lastResponse);

export const clearLastNotificationResponse = jest.fn(() => {
  mockNotifications.lastResponse = null;
});

export const addNotificationResponseReceivedListener = jest.fn((listener: ResponseListener) => {
  mockNotifications.responseListeners.add(listener);
  return { remove: () => mockNotifications.responseListeners.delete(listener) };
});
