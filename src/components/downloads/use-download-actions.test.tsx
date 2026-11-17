import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { canDownload, useDownloadActions } from '@/components/downloads/use-download-actions';
import { useStopDownloadsOnSignOut } from '@/hooks/use-video-download';
import type { DownloadTarget } from '@/utils/download-target';
import {
  makeDownloadDelivery,
  makeVideo,
  makeVideoPost,
  techCreator,
  techMainChannel,
} from '@test/fixtures';
import { mockFileSystem } from '@test/mocks/expo-file-system';

interface MockPostQuery {
  data: unknown;
  isError: boolean;
  isSuccess: boolean;
  refetch: jest.Mock;
}

const mockGetVideoPost = jest.fn<
  MockPostQuery,
  [string | undefined, number | undefined, string?]
>();

jest.mock('@/shared', () => ({
  ...jest.requireActual<object>('@/shared'),
  useSession: () => ({ token: 'token' }),
  useGetVideoPost: (...args: [string | undefined, number | undefined, string?]) =>
    mockGetVideoPost(...args),
}));

const TARGET: DownloadTarget = {
  postId: 'post-1',
  title: 'Home Lab Tour',
  durationSeconds: 600,
  attachmentId: 'guid-1',
};

const listVideo = makeVideo(techCreator, techMainChannel, { id: 'list-1', title: 'From the list' });
const textPost = makeVideo(techCreator, techMainChannel, { id: 'text-1', hasVideo: false });

const postQuery = (overrides: Partial<MockPostQuery> = {}): MockPostQuery => ({
  data: undefined,
  isError: false,
  isSuccess: false,
  refetch: jest.fn(),
  ...overrides,
});

/** The post ids `useGetVideoPost` was asked to fetch (undefined: nothing). */
const requestedPosts = (): (string | undefined)[] =>
  mockGetVideoPost.mock.calls.map(([, , postId]) => postId);

const labels = (options: readonly { label: string }[]): string[] =>
  options.map((option) => option.label);

const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL]>();
let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock.mockReset();
  mockGetVideoPost.mockReset();
  mockGetVideoPost.mockImplementation(() => postQuery());
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(makeDownloadDelivery('guid-1')), { status: 200 })),
  );
  globalThis.fetch = fetchMock;
});

afterEach(async () => {
  client.clear();
  await renderHook(() => {
    useStopDownloadsOnSignOut(false);
  });
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

async function renderActions(target?: DownloadTarget) {
  return renderHook(() => useDownloadActions(target), { wrapper });
}

describe('canDownload', () => {
  it('feed items with metadata.hasVideo, not image / text posts', () => {
    expect(canDownload(listVideo)).toBe(true);
    expect(canDownload(textPost)).toBe(false);
  });
});

describe('useDownloadActions', () => {
  it("a page's target: menu, then the qualities (fetched only now), then a download", async () => {
    const { result } = await renderActions(TARGET);
    expect(result.current.sheet).toBe('none');
    expect(result.current.target).toBe(TARGET);
    expect(result.current.download.state).toEqual({ status: 'idle' });

    await act(() => {
      result.current.openMenu();
    });
    expect(result.current.sheet).toBe('menu');
    expect(fetchMock).not.toHaveBeenCalled();

    await act(() => {
      result.current.chooseQuality();
    });
    expect(result.current.sheet).toBe('quality');
    await waitFor(() => {
      expect(labels(result.current.options.options)).toEqual(['1080p', '720p', '360p']);
    });

    const [, option] = result.current.options.options;
    if (option === undefined) {
      throw new Error('Expected a 720p option');
    }
    await act(() => {
      result.current.select(option);
    });
    // Back to the menu, which shows the download's progress.
    expect(result.current.sheet).toBe('menu');
    expect(result.current.download.state).toEqual({
      status: 'downloading',
      label: '720p',
      progress: null,
    });
    expect(mockFileSystem.lastDownload().url).toBe(option.url);
    // A page's target has its attachment: the post is never fetched.
    expect(requestedPosts().every((postId) => postId === undefined)).toBe(true);
  });

  it('close hides whichever sheet is up', async () => {
    const { result } = await renderActions(TARGET);
    await act(() => {
      result.current.chooseQuality();
    });
    await act(() => {
      result.current.close();
    });
    expect(result.current.sheet).toBe('none');
  });

  it('a list: opens the menu for the long-pressed video', async () => {
    const { result } = await renderActions();
    expect(result.current.target).toBeUndefined();

    await act(() => {
      result.current.openMenu(listVideo);
    });
    expect(result.current.sheet).toBe('menu');
    expect(result.current.target).toMatchObject({
      postId: 'list-1',
      title: 'From the list',
    });
    expect(result.current.target?.attachmentId).toBeUndefined();

    // Reopening without a post keeps the last one.
    await act(() => {
      result.current.close();
    });
    await act(() => {
      result.current.openMenu();
    });
    expect(result.current.sheet).toBe('menu');
    expect(result.current.target?.postId).toBe('list-1');
  });

  it('a list: posts without a video open nothing', async () => {
    const { result } = await renderActions();
    await act(() => {
      result.current.openMenu(textPost);
    });
    expect(result.current.sheet).toBe('none');
    expect(result.current.target).toBeUndefined();
  });

  it("a page's target wins over a pressed post", async () => {
    const { result } = await renderActions(TARGET);
    await act(() => {
      result.current.openMenu(listVideo);
    });
    expect(result.current.target).toBe(TARGET);
  });
});

describe('a feed item (no attachment id)', () => {
  async function openQualities() {
    const hook = await renderActions();
    await act(() => {
      hook.result.current.openMenu(listVideo);
    });
    return hook;
  }

  it('does not fetch the post until the quality list is open', async () => {
    const { result } = await openQualities();
    expect(requestedPosts().every((postId) => postId === undefined)).toBe(true);
    await act(() => {
      result.current.chooseQuality();
    });
    expect(mockGetVideoPost).toHaveBeenLastCalledWith('token', undefined, 'list-1');
  });

  it('while the post loads: an empty, loading list, and no qualities request', async () => {
    const { result } = await openQualities();
    await act(() => {
      result.current.chooseQuality();
    });
    expect(result.current.options).toMatchObject({ options: [], isLoading: true, isError: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("then fetches the qualities of the post's first attachment", async () => {
    const { result, rerender } = await openQualities();
    await act(() => {
      result.current.chooseQuality();
    });
    mockGetVideoPost.mockImplementation(() =>
      postQuery({ data: makeVideoPost(listVideo), isSuccess: true }),
    );
    await rerender({});
    await waitFor(() => {
      expect(labels(result.current.options.options)).toEqual(['1080p', '720p', '360p']);
    });
    expect(fetchMock.mock.calls[0]?.[0]).toEqual(expect.stringContaining('entityId=list-1-guid'));
    expect(result.current.options.isLoading).toBe(false);
  });

  it('a post without a video attachment lists nothing, loaded', async () => {
    const { result, rerender } = await openQualities();
    await act(() => {
      result.current.chooseQuality();
    });
    mockGetVideoPost.mockImplementation(() =>
      postQuery({ data: makeVideoPost(listVideo, { videoAttachments: false }), isSuccess: true }),
    );
    await rerender({});
    expect(result.current.options).toMatchObject({ options: [], isLoading: false, isError: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a failed post: an error, and Retry refetches the post', async () => {
    const failed = postQuery({ isError: true });
    mockGetVideoPost.mockImplementation(() => failed);
    const { result } = await openQualities();
    await act(() => {
      result.current.chooseQuality();
    });
    expect(result.current.options).toMatchObject({ options: [], isLoading: false, isError: true });
    expect(fetchMock).not.toHaveBeenCalled();

    result.current.options.refetch();
    expect(failed.refetch).toHaveBeenCalledTimes(1);
  });
});
