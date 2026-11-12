import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';

import { useSuggestedVideos } from '@/hooks/use-suggested-videos';
import { makeVideo, techCreator, techMainChannel } from '@test/fixtures';

const current = makeVideo(techCreator, techMainChannel, { id: 'post-1', title: 'Current' });
const next = makeVideo(techCreator, techMainChannel, { id: 'post-2', title: 'Next' });

let queryClient: QueryClient;
const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL]>();

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify([current, next]), { status: 200 }));
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

describe('useSuggestedVideos', () => {
  it("lists Floatplane's related posts for the video, without the video itself", async () => {
    const { result } = await renderHook(() => useSuggestedVideos('token', null, 'post-1'), {
      wrapper,
    });
    expect(result.current).toEqual([]);
    await waitFor(() => {
      expect(result.current).toEqual([next]);
    });
    const [input] = fetchMock.mock.calls[0] ?? ['(none)'];
    expect(urlOf(input)).toContain('/api/v3/content/related?id=post-1');
  });

  it('suggests nothing without a session', async () => {
    const { result } = await renderHook(() => useSuggestedVideos(null, null, 'post-1'), {
      wrapper,
    });
    expect(result.current).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
