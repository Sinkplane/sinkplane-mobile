import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { COMMENTS_PAGE_SIZE, usePostComments } from '@/hooks/use-post-comments';
import { makeComments } from '@test/fixtures';

const comments = makeComments('post-1', COMMENTS_PAGE_SIZE + 8); // 28: one full page + a short one

type OkResult = { ok: true; status: 200; json: () => Promise<ReturnType<typeof makeComments>>; text: () => Promise<string> };
type ErrorResult = { ok: false; status: number; json: () => Promise<never>; text: () => Promise<string> };

const fetchMock = jest.fn(async (input: RequestInfo | URL): Promise<OkResult | ErrorResult> => {
  const url = new URL(String(input));
  if (url.pathname !== '/api/v3/comment') {
    const text = `no mock for ${url.pathname}`;
    return { ok: false, status: 404, json: () => Promise.reject(new Error(text)), text: () => Promise.resolve(text) };
  }
  if (failNext) {
    failNext = false;
    return { ok: false, status: 500, json: () => Promise.reject(new Error('boom')), text: () => Promise.resolve('boom') };
  }
  const after = url.searchParams.get('fetchAfter');
  const start = after ? comments.findIndex(c => c.id === after) + 1 : 0;
  const body = comments.slice(start, start + Number(url.searchParams.get('limit') ?? 20));
  return { ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) };
});

let failNext = false;

beforeEach(() => {
  failNext = false;
  fetchMock.mockClear();
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
});

const queryClients: QueryClient[] = [];
afterEach(() => {
  queryClients.forEach(client => client.clear());
  queryClients.length = 0;
});

async function renderComments(token?: string | null, postId?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
  queryClients.push(queryClient);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return renderHook(() => usePostComments(token, postId), { wrapper });
}

describe('usePostComments', () => {
  it('fetches the first page with the post id and page size', async () => {
    const { result } = await renderComments('session-token', 'post-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages).toEqual([comments.slice(0, COMMENTS_PAGE_SIZE)]);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe('/api/v3/comment');
    expect(url.searchParams.get('blogPost')).toBe('post-1');
    expect(url.searchParams.get('limit')).toBe(String(COMMENTS_PAGE_SIZE));
    expect(url.searchParams.has('fetchAfter')).toBe(false);
  });

  it('pages by the last comment id (fetchAfter) until a short page arrives', async () => {
    const { result } = await renderComments('session-token', 'post-1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.data?.pages[1]).toEqual(comments.slice(COMMENTS_PAGE_SIZE));
    expect(result.current.hasNextPage).toBe(false);

    const urls = fetchMock.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls[1].searchParams.get('fetchAfter')).toBe(comments[COMMENTS_PAGE_SIZE - 1].id);
    expect(result.current.data?.pages.flat()).toHaveLength(comments.length);
  });

  it('reports no next page when the first page is already short', async () => {
    const short = comments.slice(0, 5);
    fetchMock.mockImplementationOnce(async () => ({
      ok: true,
      status: 200,
      json: () => Promise.resolve(short),
      text: () => Promise.resolve('[]'),
    }));

    const { result } = await renderComments('session-token', 'post-1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });

  it('surfaces fetch failures as the query error', async () => {
    failNext = true;
    const { result } = await renderComments('session-token', 'post-1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('Failed to fetch comments: 500 - boom'));
  });

  it('stays idle without a token or post id', async () => {
    const { result } = await renderComments(null, 'post-1');
    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    const { result: idless } = await renderComments('session-token', undefined);
    expect(idless.current.isLoading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
