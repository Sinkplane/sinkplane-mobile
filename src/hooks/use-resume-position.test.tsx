import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';

import { useResumePosition } from '@/hooks/use-resume-position';
import type { VideoPost } from '@/shared';

const post = (progress: number | null): VideoPost =>
  ({ id: 'post-1', progress }) as unknown as VideoPost;

type FetchImpl = (input: RequestInfo | URL) => Promise<Response>;

let queryClient: QueryClient;

function respond(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

const fetchMock = jest.fn<Promise<Response>, Parameters<FetchImpl>>();

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => respond([{ id: 'post-1', progress: 90 }]));
  globalThis.fetch = fetchMock;
});

afterEach(() => {
  queryClient.clear();
});

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const progressRequests = (): string[] =>
  fetchMock.mock.calls
    .map(([input]) => urlOf(input))
    .filter((url) => url.includes('/api/v3/content/progress'));

const renderResume = (token: string | null, videoPost: VideoPost | undefined) =>
  renderHook(() => useResumePosition(token, 'post-1', videoPost), { wrapper });

describe('useResumePosition', () => {
  it("uses the post's own progress without asking the batch endpoint", async () => {
    const { result } = await renderResume('token', post(42));
    expect(result.current).toEqual({ ready: true, seconds: 42 });
    expect(progressRequests()).toHaveLength(0);
  });

  it('waits for the batch endpoint when the post has no progress, then resumes from it', async () => {
    const { result } = await renderResume('token', post(null));
    expect(result.current.ready).toBe(false);
    await waitFor(() => {
      expect(result.current).toEqual({ ready: true, seconds: 90 });
    });
    expect(progressRequests()[0]).toContain('ids%5B0%5D=post-1');
  });

  it('starts from the beginning when the batch endpoint has nothing for this video', async () => {
    fetchMock.mockImplementation(() => respond([{ id: 'other', progress: 30 }]));
    const { result } = await renderResume('token', post(0));
    await waitFor(() => {
      expect(result.current).toEqual({ ready: true, seconds: undefined });
    });
  });

  it('a zero batch progress means no resume', async () => {
    fetchMock.mockImplementation(() => respond([{ id: 'post-1', progress: 0 }]));
    const { result } = await renderResume('token', post(null));
    await waitFor(() => {
      expect(result.current).toEqual({ ready: true, seconds: undefined });
    });
  });

  it("doesn't block playback when the batch endpoint fails", async () => {
    const consoleError = jest.spyOn(console, 'error').mockReturnValue();
    fetchMock.mockImplementation(() => respond({ message: 'nope' }, 500));
    const { result } = await renderResume('token', post(null));
    await waitFor(() => {
      expect(result.current).toEqual({ ready: true, seconds: undefined });
    });
    consoleError.mockRestore();
  });

  it('is ready immediately without a session (nothing to fetch)', async () => {
    const { result } = await renderResume(null, undefined);
    expect(result.current).toEqual({ ready: true, seconds: undefined });
    expect(progressRequests()).toHaveLength(0);
  });

  it("ignores the previous video's progress kept as placeholder while the next one loads", async () => {
    const { result, rerender } = await renderHook(
      ({ id }: { id: string }) => useResumePosition('token', id, post(null)),
      { wrapper, initialProps: { id: 'post-1' } },
    );
    await waitFor(() => {
      expect(result.current.seconds).toBe(90);
    });

    let release = (): void => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = () => {
            void respond([{ id: 'post-2', progress: 12 }]).then(resolve);
          };
        }),
    );
    await rerender({ id: 'post-2' });
    expect(result.current).toEqual({ ready: false, seconds: undefined });
    release();
    await waitFor(() => {
      expect(result.current).toEqual({ ready: true, seconds: 12 });
    });
  });
});
