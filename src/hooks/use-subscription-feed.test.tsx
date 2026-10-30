import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useSubscriptionFeed } from '@/hooks/use-subscription-feed';
import { AssDass, type Video } from '@/shared';
import { makeVideo, techCreator, techMainChannel, techSideChannel } from '@test/fixtures';

// ---------------------------------------------------------------------------
// In-memory /api/v3/content/creator: serves one creator's videos with the
// limit/fetchAfter/sort/search/channel handling the real endpoint has.
// ---------------------------------------------------------------------------

type OkResult = { ok: true; status: 200; json: () => Promise<Video[]>; text: () => Promise<string> };
type ErrorResult = { ok: false; status: number; json: () => Promise<never>; text: () => Promise<string> };

let videosByCreator: Map<string, Video[]>;
/** Optional scripted pages per creator (shifted in order), to simulate API drift. */
let scriptedPages: Map<string, Video[][]>;
let failures: Map<string, { remaining: number; status: number; body: string }>;

function sliceCreator(creatorId: string, params: URLSearchParams): Video[] {
  const scripted = scriptedPages.get(creatorId);
  if (scripted && scripted.length > 0) return scripted.shift()!;

  const all = videosByCreator.get(creatorId) ?? [];
  const channel = params.get('channel');
  const search = (params.get('search') ?? '').trim().toLowerCase();
  const filtered = all.filter(
    v => (!channel || v.channel?.id === channel) && (!search || v.title.toLowerCase().includes(search)),
  );
  const ordered = params.get('sort') === 'ASC' ? [...filtered].reverse() : filtered;
  const from = Number(params.get('fetchAfter') ?? 0);
  return ordered.slice(from, from + Number(params.get('limit') ?? 20));
}

const fetchMock = jest.fn(async (input: RequestInfo | URL): Promise<OkResult | ErrorResult> => {
  const url = new URL(String(input));
  if (url.pathname !== '/api/v3/content/creator') {
    const text = `no mock for ${url.pathname}`;
    return { ok: false, status: 404, json: () => Promise.reject(new Error(text)), text: () => Promise.resolve(text) };
  }

  const creatorId = url.searchParams.get('id')!;
  const failure = failures.get(creatorId);
  if (failure && failure.remaining > 0) {
    failure.remaining -= 1;
    return {
      ok: false,
      status: failure.status,
      json: () => Promise.reject(new Error(failure.body)),
      text: () => Promise.resolve(failure.body),
    };
  }
  const body = sliceCreator(creatorId, url.searchParams);
  return { ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) };
});

beforeEach(() => {
  videosByCreator = new Map();
  scriptedPages = new Map();
  failures = new Map();
  fetchMock.mockClear();
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
});

interface Call {
  creatorId: string;
  fetchAfter: number;
  limit: number;
  search: string;
  sort: string;
  channel: string | null;
}

const calls = (): Call[] =>
  fetchMock.mock.calls.map(([input]) => {
    const params = new URL(String(input)).searchParams;
    return {
      creatorId: params.get('id')!,
      fetchAfter: Number(params.get('fetchAfter')),
      limit: Number(params.get('limit')),
      search: params.get('search') ?? '',
      sort: params.get('sort') ?? '',
      channel: params.get('channel'),
    };
  });

const callsFor = (creatorId: string) => calls().filter(call => call.creatorId === creatorId);

const day = (daysAgo: number) => new Date(Date.UTC(2026, 9, 1) - daysAgo * 24 * 60 * 60 * 1000).toISOString();

/** Videos with release dates one day apart, oldest-last (the API's DESC order). */
function datedVideos(ids: string[], firstDay = 1): Video[] {
  return ids.map((id, index) => makeVideo(techCreator, techMainChannel, { id, title: `Video ${id}`, releaseDate: day(firstDay + index) }));
}

interface FeedProps {
  creatorIds: string[];
  sort?: AssDass;
  search?: string;
  channel?: string;
  limit?: number;
}

// QueryClients created per test; torn down so react-query's GC timers don't outlive the run.
const queryClients: QueryClient[] = [];

afterEach(() => {
  queryClients.forEach(client => client.clear());
  queryClients.length = 0;
});

async function renderFeed(props: FeedProps) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClients.push(queryClient);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(
    ({ creatorIds, sort = AssDass.DESC, search, channel, limit }: FeedProps) =>
      useSubscriptionFeed('session-token', { creatorIds, sort, search, channel, limit }),
    { wrapper, initialProps: props },
  );
}

describe('useSubscriptionFeed', () => {
  it('fetches every creator in parallel and merges their posts by release date', async () => {
    videosByCreator.set('a', datedVideos(['a1', 'a2', 'a3'])); // days 1..3
    videosByCreator.set('b', datedVideos(['b1', 'b2'], 1.5)); // days 1.5, 2.5 → interleave

    const { result } = await renderFeed({ creatorIds: ['a', 'b'], limit: 10 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.videos.map(v => v.id)).toEqual(['a1', 'b1', 'a2', 'b2', 'a3']);
    expect(callsFor('a')[0]).toMatchObject({ fetchAfter: 0, limit: 10, sort: 'DESC' });
    expect(callsFor('b')[0]).toMatchObject({ fetchAfter: 0 });
    expect(result.current.hasNextPage).toBe(false);
  });

  it('sorts the merged feed oldest-first when asked', async () => {
    videosByCreator.set('a', datedVideos(['a1', 'a2'])); // days 1, 2
    videosByCreator.set('b', datedVideos(['b1'], 3)); // day 3 → oldest overall

    const { result } = await renderFeed({ creatorIds: ['a', 'b'], sort: AssDass.ASC, limit: 10 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.videos.map(v => v.id)).toEqual(['b1', 'a2', 'a1']);
    expect(calls()[0].sort).toBe('ASC');
  });

  it('paginates per creator and stops requesting exhausted creators', async () => {
    videosByCreator.set('a', datedVideos(Array.from({ length: 15 }, (_, i) => `a${i + 1}`))); // 15 videos
    videosByCreator.set('b', datedVideos(['b1', 'b2', 'b3'], 5)); // short page → exhausted immediately

    const { result } = await renderFeed({ creatorIds: ['a', 'b'], limit: 10 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.videos).toHaveLength(13); // a: 10 + b: 3
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.videos).toHaveLength(18)); // a's last 5
    expect(result.current.videos.map(v => v.id)).toContain('a15');
    expect(callsFor('b')).toHaveLength(1);
    expect(callsFor('a').at(-1)!.fetchAfter).toBe(10);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('dedupes a post the API returns again in a later round', async () => {
    videosByCreator.set('a', datedVideos(['a1', 'a2', 'a3']));
    scriptedPages.set('a', [
      [datedVideos(['a1'])[0], datedVideos(['a2'])[0]], // full page → continue
      [datedVideos(['a2'])[0], datedVideos(['a3'])[0]], // a2 again (index drift)
    ]);

    const { result } = await renderFeed({ creatorIds: ['a'], limit: 2 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.videos.map(v => v.id)).toEqual(['a1', 'a2', 'a3']));
  });

  it('passes the search term and channel filter through to the API', async () => {
    videosByCreator.set('a', [
      makeVideo(techCreator, techMainChannel, { id: 'main-homelab', title: 'Home Lab Tour' }),
      makeVideo(techCreator, techSideChannel, { id: 'side-homelab', title: 'Home Lab Extras' }),
      makeVideo(techCreator, techMainChannel, { id: 'main-other', title: 'Unrelated' }),
    ]);

    const { result } = await renderFeed({ creatorIds: ['a'], search: 'home lab', channel: techMainChannel.id, limit: 10 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.videos.map(v => v.id)).toEqual(['main-homelab']);
    expect(calls()[0]).toMatchObject({ search: 'home lab', channel: techMainChannel.id });
  });

  it('surfaces a failed creator request as the query error', async () => {
    videosByCreator.set('a', datedVideos(['a1']));
    videosByCreator.set('b', datedVideos(['b1']));
    failures.set('b', { remaining: 1, status: 500, body: 'upstream exploded' });

    const { result } = await renderFeed({ creatorIds: ['a', 'b'], limit: 10 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('Failed to fetch videos: 500 - upstream exploded'));
  });

  it('stays idle without creators to fetch', async () => {
    const { result } = await renderFeed({ creatorIds: [] });

    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.videos).toEqual([]);
  });
});
