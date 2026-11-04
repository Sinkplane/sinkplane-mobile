import {
  fetchNotificationSettings,
  NOTIFICATION_LIST_PATH,
  NOTIFICATION_UPDATE_PATH,
  updateNotificationSetting,
} from '@/notifications/notification-settings-api';

const respond = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }) as Response;

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock;
});

describe('fetchNotificationSettings', () => {
  it('flattens the list with the smallest icon ≥ 100px', async () => {
    fetchMock.mockResolvedValue(
      respond(200, [
        {
          creator: {
            id: 'c1',
            title: 'LTT',
            icon: {
              path: 'https://pbs/icon.jpg',
              childImages: [
                { width: 50, path: 'https://pbs/icon_50.jpg' },
                { width: 100, path: 'https://pbs/icon_100.jpg' },
              ],
            },
          },
          userNotificationSetting: { creator: 'c1', contentFirebase: false, contentEmail: true },
        },
        { creator: { id: 'c2', icon: { path: 'https://pbs/c2.jpg' } }, userNotificationSetting: { creator: 'c2' } },
        { userNotificationSetting: { creator: 'c3', contentFirebase: true } },
        { creator: {} },
      ]),
    );

    expect(await fetchNotificationSettings('tok')).toEqual([
      { creatorId: 'c1', title: 'LTT', iconUrl: 'https://pbs/icon_100.jpg', contentFirebase: false, contentEmail: true },
      { creatorId: 'c2', title: 'Creator', iconUrl: 'https://pbs/c2.jpg', contentFirebase: true, contentEmail: false },
      { creatorId: 'c3', title: 'Creator', iconUrl: null, contentFirebase: true, contentEmail: false },
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://www.floatplane.com${NOTIFICATION_LIST_PATH}`);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });

  it('treats a non-list body as empty', async () => {
    fetchMock.mockResolvedValue(respond(200, { unexpected: true }));
    expect(await fetchNotificationSettings('tok')).toEqual([]);
  });

  it('throws on HTTP errors', async () => {
    fetchMock.mockResolvedValue(respond(500, 'down'));
    await expect(fetchNotificationSettings('tok')).rejects.toThrow('Failed to load notification settings: 500 - down');
  });
});

describe('updateNotificationSetting', () => {
  it('posts the change', async () => {
    fetchMock.mockResolvedValue(respond(200, {}));
    await updateNotificationSetting('tok', 'c1', 'contentEmail', true);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://www.floatplane.com${NOTIFICATION_UPDATE_PATH}`);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ creator: 'c1', property: 'contentEmail', newValue: true });
  });

  it('throws on HTTP errors, even without a readable body', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: () => Promise.reject(new Error('stream')) } as unknown as Response);
    await expect(updateNotificationSetting('tok', 'c1', 'contentFirebase', false)).rejects.toThrow(
      'Failed to update notification settings: 403 - ',
    );
  });
});
