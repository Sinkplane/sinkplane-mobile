/**
 * E2E: the notifications section of Settings — master switch, blocked permission, and Floatplane's
 * per-creator switches.
 */
import { gamingCreator, techCreator } from '@test/fixtures';

import {
  launch,
  launchWithNotifications,
  openSettings,
  settingsTab,
  TASK,
} from './helpers/notifications-flows';
import { loadRuntime, type Runtime } from './helpers/runtime';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

describe('settings', () => {
  it('lists Floatplane’s per-creator switches and saves changes', async () => {
    await launchWithNotifications(rt);
    await openSettings(rt);

    await rt.until(() => {
      expect(settingsTab(rt).getByLabelText('Notifications for Tech Channel')).toBeTruthy();
    });
    expect(settingsTab(rt).getByTestId('notifications-switch').props['value']).toBe(true);
    expect(settingsTab(rt).getByLabelText('Notifications for Tech Channel').props['value']).toBe(
      true,
    );
    expect(settingsTab(rt).getByLabelText('Emails for Gaming Channel').props['value']).toBe(false);

    await rt.fireEvent(
      settingsTab(rt).getByLabelText('Notifications for Tech Channel'),
      'valueChange',
      false,
    );
    await rt.until(() => {
      expect(rt.api.notificationSettingFor(techCreator.id).contentFirebase).toBe(false);
    });
    expect(settingsTab(rt).getByLabelText('Notifications for Tech Channel').props['value']).toBe(
      false,
    );

    await rt.fireEvent(
      settingsTab(rt).getByLabelText('Emails for Gaming Channel'),
      'valueChange',
      true,
    );
    await rt.until(() => {
      expect(rt.api.notificationSettingFor(gamingCreator.id).contentEmail).toBe(true);
    });
    expect(
      rt.api.requestsTo('/api/v3/user/notification/update', 'POST').map((req) => req.body),
    ).toEqual([
      { creator: techCreator.id, property: 'contentFirebase', newValue: false },
      { creator: gamingCreator.id, property: 'contentEmail', newValue: true },
    ]);
  });

  it('rolls a switch back when Floatplane refuses the change', async () => {
    await launchWithNotifications(rt);
    await openSettings(rt);
    await rt.until(() => {
      expect(settingsTab(rt).getByLabelText('Notifications for Tech Channel')).toBeTruthy();
    });

    rt.api.failRequests('POST /api/v3/user/notification/update', { status: 500, body: 'nope' });
    await rt.fireEvent(
      settingsTab(rt).getByLabelText('Notifications for Tech Channel'),
      'valueChange',
      false,
    );

    await rt.until(() => {
      expect(
        settingsTab(rt).getByText('Couldn’t save that change. Please try again.'),
      ).toBeTruthy();
    });
    expect(settingsTab(rt).getByLabelText('Notifications for Tech Channel').props['value']).toBe(
      true,
    );
  });

  it('turning notifications off closes the socket and cancels the background check', async () => {
    await launchWithNotifications(rt);
    await rt.until(() => {
      expect(rt.taskManager.registered.has(TASK)).toBe(true);
    });
    await openSettings(rt);

    await rt.fireEvent(settingsTab(rt).getByTestId('notifications-switch'), 'valueChange', false);

    await rt.until(() => {
      expect(rt.socket.connected()).toHaveLength(0);
    });
    await rt.until(() => {
      expect(rt.taskManager.registered.has(TASK)).toBe(false);
    });
    expect(rt.secureStore.get('sinkplane.notifications.enabled')).toBe('false');
    expect(settingsTab(rt).queryByLabelText('Notifications for Tech Channel')).toBeNull();

    await rt.fireEvent(settingsTab(rt).getByTestId('notifications-switch'), 'valueChange', true);
    await rt.until(() => {
      expect(rt.socket.connected()).toHaveLength(1);
    });
    await rt.until(() => {
      expect(rt.taskManager.registered.has(TASK)).toBe(true);
    });
  });

  it('points at system settings when notifications are blocked', async () => {
    rt.notifications.mockNotifications.setPermission('denied');
    rt.secureStore.set('sinkplane.notifications.enabled', 'false');
    await launch(rt);
    await openSettings(rt);

    await rt.until(() => {
      expect(
        settingsTab(rt).getByText('Notifications are turned off for Sinkplane in system settings.'),
      ).toBeTruthy();
    });
    expect(settingsTab(rt).getByTestId('notifications-switch').props['value']).toBe(false);

    // Trying to turn it on can't prompt again: it stays off.
    await rt.fireEvent(settingsTab(rt).getByTestId('notifications-switch'), 'valueChange', true);
    expect(rt.notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(settingsTab(rt).getByTestId('notifications-switch').props['value']).toBe(false);

    const openSettingsSpy = jest.spyOn(rt.linking, 'openSettings').mockResolvedValue(undefined);
    await rt.fireEvent.press(settingsTab(rt).getByText('Open Settings'));
    expect(openSettingsSpy).toHaveBeenCalled();
  });

  it('offers a retry when the creator settings fail to load', async () => {
    // The first load and both of react-query's retries fail.
    rt.api.failRequests(
      'GET /api/v3/user/notification/list',
      { status: 500, body: 'down' },
      { count: 3 },
    );
    await launchWithNotifications(rt);
    await openSettings(rt);

    await rt.until(
      () => {
        expect(
          settingsTab(rt).getByText('Couldn’t load creator settings. Tap to retry.'),
        ).toBeTruthy();
      },
      {
        maxFakeMs: 20_000,
      },
    );
    await rt.fireEvent.press(
      settingsTab(rt).getByText('Couldn’t load creator settings. Tap to retry.'),
    );
    await rt.until(() => {
      expect(settingsTab(rt).getByLabelText('Notifications for Tech Channel')).toBeTruthy();
    });
  });
});
