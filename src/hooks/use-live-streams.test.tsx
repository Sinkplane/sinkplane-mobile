import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { LIVE_POLL_MS, useLiveStreams } from '@/hooks/use-live-streams';
import type { Creator } from '@/shared';
import { gamingCreator, LIVESTREAM_ID, makeLiveDelivery, techCreator } from '@test/fixtures';

// In-memory /api/v3/delivery/info: liveStreamId → response (404 when absent, like an offline stream).
let responses: Map<string, { status: number; body: unknown }>;

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

function fakeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

const fetchMock = jest.fn((input: RequestInfo | URL) => {
  const url = new URL(urlOf(input));
  const response = responses.get(url.searchParams.get('entityId') ?? '') ?? {
    status: 404,
    body: { message: 'Not live' },
  };
  return Promise.resolve(fakeResponse(response.status, response.body));
});

/** The first call's URL. */
function firstFetchUrl(): URL {
  const [call] = fetchMock.mock.calls;
  if (!call) {
    throw new Error('fetch was not called');
  }
  return new URL(urlOf(call[0]));
}

beforeEach(() => {
  responses = new Map();
  fetchMock.mockClear();
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
});

const queryClients: QueryClient[] = [];

afterEach(() => {
  queryClients.forEach((client) => {
    client.clear();
  });
  queryClients.length = 0;
});

/** A second streaming creator (the fixtures only give Tech a livestream). */
const techLiveStream = techCreator.liveStream;
if (!techLiveStream) {
  throw new Error('the Tech fixture has a livestream');
}
const gamingStreamer: Creator = {
  ...gamingCreator,
  liveStream: { ...techLiveStream, id: 'gaming-live' },
};

interface Props {
  token?: string | null | undefined;
  creators?: Creator[] | undefined;
  poll?: boolean | undefined;
}

async function renderStreams(overrides: Props = {}) {
  // Spread (not destructuring defaults) so an explicit `undefined` sticks.
  const initialProps: Props = {
    token: 'session-token',
    creators: [techCreator, gamingCreator],
    ...overrides,
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClients.push(queryClient);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(
    (props: Props) => useLiveStreams(props.token, props.creators, { poll: props.poll }),
    {
      wrapper,
      initialProps,
    },
  );
}

const disableVariant = <T extends object>(variant: T) => ({ ...variant, enabled: false });

describe('useLiveStreams', () => {
  it('reports a live stream with its adaptive playlist URL', async () => {
    responses.set(LIVESTREAM_ID, { status: 200, body: makeLiveDelivery() });

    const { result } = await renderStreams();

    await waitFor(() => {
      expect(result.current[0]?.status).toBe('live');
    });
    expect(result.current).toHaveLength(1); // Gaming has no livestream
    expect(result.current[0]).toMatchObject({
      id: techCreator.id,
      creator: techCreator,
      liveStream: techCreator.liveStream,
      streamUrl: `https://live.floatplane.test/${LIVESTREAM_ID}/live-abr.m3u8?token=signed`,
      error: null,
    });
    expect(result.current[0]?.checkedAt).toBeGreaterThan(0);

    const url = firstFetchUrl();
    expect(url.pathname).toBe('/api/v3/delivery/info');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      scenario: 'live',
      entityId: LIVESTREAM_ID,
      entityKind: 'livestream',
    });
  });

  it('treats a 404 as offline', async () => {
    const { result } = await renderStreams();

    expect(result.current[0]?.status).toBe('loading');
    await waitFor(() => {
      expect(result.current[0]?.status).toBe('offline');
    });
    expect(result.current[0]?.streamUrl).toBeNull();
    expect(result.current[0]?.error).toBeNull();
  });

  it('treats a delivery without a playable variant as offline', async () => {
    const delivery = makeLiveDelivery();
    delivery.groups = delivery.groups.map((group) => ({
      ...group,
      variants: group.variants.map(disableVariant),
    }));
    responses.set(LIVESTREAM_ID, { status: 200, body: delivery });

    const { result } = await renderStreams();

    await waitFor(() => {
      expect(result.current[0]?.status).toBe('offline');
    });
  });

  it('reports other failures as errors', async () => {
    responses.set(LIVESTREAM_ID, { status: 503, body: 'upstream down' });

    const { result } = await renderStreams();

    await waitFor(() => {
      expect(result.current[0]?.status).toBe('error');
    });
    expect(result.current[0]?.error?.message).toBe(
      'Failed to check the live stream: 503 - upstream down',
    );
  });

  it('lists live streams first', async () => {
    responses.set('gaming-live', { status: 200, body: makeLiveDelivery('gaming-live') });

    const { result } = await renderStreams({ creators: [techCreator, gamingStreamer] });

    const statuses = () => result.current.map((stream) => stream.status);
    await waitFor(() => {
      expect(statuses()).toEqual(['live', 'offline']);
    });
    expect(result.current.map((stream) => stream.id)).toEqual([gamingCreator.id, techCreator.id]);
  });

  it('waits for a token and for the creators', async () => {
    const { result, rerender } = await renderStreams({ token: null, creators: undefined });
    expect(result.current).toEqual([]);

    await rerender({ token: null, creators: [techCreator] });
    expect(result.current[0]?.status).toBe('loading');
    expect(fetchMock).not.toHaveBeenCalled();

    await rerender({ token: 'session-token', creators: [techCreator] });
    await waitFor(() => {
      expect(result.current[0]?.status).toBe('offline');
    });
  });

  it('keeps the last status while a refreshed token fetches delivery again', async () => {
    responses.set(LIVESTREAM_ID, { status: 200, body: makeLiveDelivery() });
    const { result, rerender } = await renderStreams();
    await waitFor(() => {
      expect(result.current[0]?.status).toBe('live');
    });

    let finish!: (response: Awaited<ReturnType<typeof fetchMock>>) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const checkedAt = result.current[0]?.checkedAt;
    try {
      await rerender({ token: 'refreshed-token', creators: [techCreator, gamingCreator] });
      expect(result.current[0]?.status).toBe('live');
      expect(result.current[0]?.streamUrl).toContain('live-abr.m3u8');
      expect(result.current[0]?.checkedAt).toBe(checkedAt);
    } finally {
      await act(() => {
        finish(fakeResponse(404, ''));
      });
    }
    await waitFor(() => {
      expect(result.current[0]?.status).toBe('offline');
    });
  });

  it('does not carry a live answer over to another stream or a missing token', async () => {
    responses.set(LIVESTREAM_ID, { status: 200, body: makeLiveDelivery() });
    const { result, rerender } = await renderStreams();
    await waitFor(() => {
      expect(result.current[0]?.status).toBe('live');
    });

    await rerender({ token: null, creators: [techCreator] });
    expect(result.current[0]?.status).toBe('loading');
    expect(result.current[0]?.streamUrl).toBeNull();

    await rerender({ token: 'refreshed-token', creators: [gamingStreamer] });
    // Tech's live answer must not leak into Gaming's stream. Its own 404 may already be back
    // (the mock fetch resolves immediately), so only rule out a carried-over live answer.
    expect(result.current[0]?.id).toBe(gamingCreator.id);
    expect(result.current[0]?.status).not.toBe('live');
    expect(result.current[0]?.streamUrl).toBeNull();
    await waitFor(() => {
      expect(result.current[0]?.status).toBe('offline');
    });
  });

  it('refetches on demand', async () => {
    const { result } = await renderStreams();
    await waitFor(() => {
      expect(result.current[0]?.status).toBe('offline');
    });

    responses.set(LIVESTREAM_ID, { status: 200, body: makeLiveDelivery() });
    await act(async () => {
      await result.current[0]?.refetch();
    });

    await waitFor(() => {
      expect(result.current[0]?.status).toBe('live');
    });
  });

  describe('polling', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const advance = (ms: number) =>
      act(async () => {
        await jest.advanceTimersByTimeAsync(ms);
      });

    it('re-checks every minute with `poll`', async () => {
      const { result } = await renderStreams({ poll: true });
      await advance(0);
      expect(result.current[0]?.status).toBe('offline');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      responses.set(LIVESTREAM_ID, { status: 200, body: makeLiveDelivery() });
      await advance(LIVE_POLL_MS);
      await advance(10); // react-query notifies observers on a later tick

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.current[0]?.status).toBe('live');
    });

    it('does not poll without `poll`', async () => {
      await renderStreams();
      await advance(0);
      await advance(LIVE_POLL_MS * 2);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
