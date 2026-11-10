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
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  }) as Response;

type FetchArgs = [RequestInfo | URL, RequestInit?];
let fetchMock: jest.Mock<Promise<Response>, FetchArgs>;

function requestUrl(input: RequestInfo | URL | undefined): string {
  if (input === undefined || typeof input === 'string') {
    return input ?? '';
  }
  return input instanceof URL ? input.href : input.url;
}

/** The URL, init and (string) body of the first fetch call. */
function firstCall(): { url: string; init: RequestInit; body: string } {
  const [url, init = {}] = fetchMock.mock.calls[0] ?? [];
  return { url: requestUrl(url), init, body: typeof init.body === 'string' ? init.body : '' };
}

beforeEach(() => {
  fetchMock = jest.fn<Promise<Response>, FetchArgs>();
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
        {
          creator: { id: 'c2', icon: { path: 'https://pbs/c2.jpg' } },
          userNotificationSetting: { creator: 'c2' },
        },
        { userNotificationSetting: { creator: 'c3', contentFirebase: true } },
        { creator: {} },
      ]),
    );

    expect(await fetchNotificationSettings('tok')).toEqual([
      {
        creatorId: 'c1',
        title: 'LTT',
        iconUrl: 'https://pbs/icon_100.jpg',
        contentFirebase: false,
        contentEmail: true,
      },
      {
        creatorId: 'c2',
        title: 'Creator',
        iconUrl: 'https://pbs/c2.jpg',
        contentFirebase: true,
        contentEmail: false,
      },
      {
        creatorId: 'c3',
        title: 'Creator',
        iconUrl: null,
        contentFirebase: true,
        contentEmail: false,
      },
    ]);
    expect(firstCall().url).toBe(`https://www.floatplane.com${NOTIFICATION_LIST_PATH}`);
    expect(new Headers(firstCall().init.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('treats a non-list body as empty', async () => {
    fetchMock.mockResolvedValue(respond(200, { unexpected: true }));
    expect(await fetchNotificationSettings('tok')).toEqual([]);
  });

  it('throws on HTTP errors', async () => {
    fetchMock.mockResolvedValue(respond(500, 'down'));
    await expect(fetchNotificationSettings('tok')).rejects.toThrow(
      'Failed to load notification settings: 500 - down',
    );
  });
});

describe('updateNotificationSetting', () => {
  it('posts the change', async () => {
    fetchMock.mockResolvedValue(respond(200, {}));
    await updateNotificationSetting('tok', {
      creatorId: 'c1',
      property: 'contentEmail',
      value: true,
    });
    expect(firstCall().url).toBe(`https://www.floatplane.com${NOTIFICATION_UPDATE_PATH}`);
    expect(firstCall().init).toMatchObject({ method: 'POST' });
    expect(JSON.parse(firstCall().body)).toEqual({
      creator: 'c1',
      property: 'contentEmail',
      newValue: true,
    });
  });

  it('throws on HTTP errors, even without a readable body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.reject(new Error('stream')),
    } as Response);
    const change = { creatorId: 'c1', property: 'contentFirebase', value: false } as const;
    await expect(updateNotificationSetting('tok', change)).rejects.toThrow(
      'Failed to update notification settings: 403 - ',
    );
  });
});
