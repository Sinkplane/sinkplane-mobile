import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useWatchHistory } from '@/hooks/use-watch-history';
import type { ContentHistoryEntry, Video } from '@/shared';
import { makeHistoryEntry, makeVideo, techCreator, techMainChannel } from '@test/fixtures';

// ---------------------------------------------------------------------------
// In-memory /api/v3/content/history: offset pagination with a fixed page size
// (the server chooses it), plus optional scripted pages to simulate a post
// shifting between pages while the user keeps watching.
// ---------------------------------------------------------------------------

interface OkResult {
  ok: true;
  status: 200;
  json: () => Promise<ContentHistoryEntry[]>;
  text: () => Promise<string>;
}
interface ErrorResult {
  ok: false;
  status: number;
  json: () => Promise<never>;
  text: () => Promise<string>;
}

const PAGE_SIZE = 2;

let entries: ContentHistoryEntry[];
/** Scripted pages, shifted in order; when empty the store serves `entries` by offset. */
let scriptedPages: ContentHistoryEntry[][];
let failure: { remaining: number; status: number; body: string } | null;

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

/** The fake /api/v3/content/history. */
function respond(input: RequestInfo | URL): OkResult | ErrorResult {
  const url = new URL(urlOf(input));
  if (url.pathname !== '/api/v3/content/history') {
    const text = `no mock for ${url.pathname}`;
    return {
      ok: false,
      status: 404,
      json: () => Promise.reject(new Error(text)),
      text: () => Promise.resolve(text),
    };
  }

  if (failure && failure.remaining > 0) {
    failure.remaining -= 1;
    const { status, body: errorBody } = failure;
    return {
      ok: false,
      status,
      json: () => Promise.reject(new Error(errorBody)),
      text: () => Promise.resolve(errorBody),
    };
  }

  const scripted = scriptedPages.shift();
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const body = scripted ?? entries.slice(offset, offset + PAGE_SIZE);
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

const fetchMock = jest.fn((input: RequestInfo | URL) => Promise.resolve(respond(input)));

beforeEach(() => {
  entries = [];
  scriptedPages = [];
  failure = null;
  fetchMock.mockClear();
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
});

const requestedOffsets = () =>
  fetchMock.mock.calls.map(([input]) => Number(new URL(urlOf(input)).searchParams.get('offset')));

const video = (id: string) => makeVideo(techCreator, techMainChannel, { id, title: `Video ${id}` });
const videoIds = (result: { current: { videos: Video[] } }) =>
  result.current.videos.map((v) => v.id);
const entry = (post: Video, progress: number) => makeHistoryEntry(post, progress);

interface HistoryProps {
  token?: string | undefined;
  tokenExpiration?: string | undefined;
}

// QueryClients created per test; torn down so react-query's GC timers don't outlive the run.
const queryClients: QueryClient[] = [];

afterEach(() => {
  queryClients.forEach((client) => {
    client.clear();
  });
  queryClients.length = 0;
});

async function renderHistory(
  props: HistoryProps = { token: 'session-token', tokenExpiration: '2030-01-01' },
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClients.push(queryClient);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(
    ({ token, tokenExpiration }: HistoryProps) => useWatchHistory(token, tokenExpiration),
    {
      wrapper,
      initialProps: props,
    },
  );
}

describe('useWatchHistory', () => {
  it('flattens the fetched page into posts with their progress, in API order', async () => {
    entries = [entry(video('v1'), 30), entry(video('v2'), 0)];

    const { result } = await renderHistory();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.videos.map((v) => v.id)).toEqual(['v1', 'v2']);
    expect(result.current.progressById.get('v1')).toBe(30);
    expect(result.current.progressById.get('v2')).toBe(0);
    expect(requestedOffsets()).toEqual([0]);
  });

  it('paginates with the sum of fetched page lengths until a page comes back empty', async () => {
    entries = ['v1', 'v2', 'v3', 'v4', 'v5'].map((id, index) => entry(video(id), index * 10));

    const { result } = await renderHistory();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.videos.map((v) => v.id)).toEqual(['v1', 'v2']);
    expect(result.current.hasNextPage).toBe(true); // a full page promises more

    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => {
      expect(result.current.videos).toHaveLength(4);
    });
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => {
      expect(result.current.videos).toHaveLength(5);
    });
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => {
      expect(result.current.hasNextPage).toBe(false);
    }); // the empty tail page ends paging

    expect(requestedOffsets()).toEqual([0, 2, 4, 5]); // 2 + 2 + 1 entries fetched so far
    expect(result.current.videos.map((v) => v.id)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5']);
    expect(result.current.progressById.get('v5')).toBe(40);
  });

  it('keeps only the first entry of a post the API returns again in a later page', async () => {
    scriptedPages = [
      [entry(video('v1'), 10), entry(video('v2'), 20)],
      [entry(video('v1'), 99), entry(video('v3'), 30)], // v1 shifted down a page (watched meanwhile)
    ];

    const { result } = await renderHistory();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => {
      expect(videoIds(result)).toEqual(['v1', 'v2', 'v3']);
    });
    expect(result.current.videos.filter((v) => v.id === 'v1')).toHaveLength(1);
    expect(result.current.progressById.get('v1')).toBe(10); // the first (most recent) entry's progress
  });

  it('skips entries whose post is gone or has no id', async () => {
    const gone = {
      ...entry(video('gone'), 10),
      blogPost: undefined,
    } as unknown as ContentHistoryEntry;
    const unnamed = { ...entry(video('unnamed'), 20), blogPost: { ...video('unnamed'), id: '' } };
    scriptedPages = [[entry(video('v1'), 5), gone, unnamed]];

    const { result } = await renderHistory();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.videos.map((v) => v.id)).toEqual(['v1']);
    expect(result.current.progressById.has('gone')).toBe(false);
    expect(result.current.progressById.has('unnamed')).toBe(false);
  });

  it('stays idle without a session token', async () => {
    const { result } = await renderHistory({ token: undefined, tokenExpiration: undefined });

    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.videos).toEqual([]);
    expect(result.current.progressById.size).toBe(0);
  });

  it('surfaces a failed history request as the query error', async () => {
    failure = { remaining: 1, status: 500, body: 'history blast' };

    const { result } = await renderHistory();

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toEqual(
      new Error('Failed to fetch watch history: 500 - history blast'),
    );
    expect(result.current.videos).toEqual([]);
  });
});
