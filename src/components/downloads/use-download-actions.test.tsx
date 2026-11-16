import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { canDownload, useDownloadActions } from '@/components/downloads/use-download-actions';
import { useStopDownloadsOnSignOut } from '@/hooks/use-video-download';
import type { DownloadTarget } from '@/utils/download-target';
import { makeDownloadDelivery, makeVideo, techCreator, techMainChannel } from '@test/fixtures';
import { mockFileSystem } from '@test/mocks/expo-file-system';

jest.mock('@/shared', () => ({
  ...jest.requireActual<object>('@/shared'),
  useSession: () => ({ token: 'token' }),
}));

const TARGET: DownloadTarget = {
  postId: 'post-1',
  title: 'Home Lab Tour',
  durationSeconds: 600,
  attachmentId: 'guid-1',
};

const listVideo = makeVideo(techCreator, techMainChannel, { id: 'list-1', title: 'From the list' });
const textPost = { ...listVideo, id: 'text-1', videoAttachments: [] };

const labels = (options: readonly { label: string }[]): string[] =>
  options.map((option) => option.label);

const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL]>();
let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock.mockReset();
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
  it('only posts with a video attachment', () => {
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
    expect(result.current.sheet).toBe('none');
    expect(result.current.download.state).toEqual({
      status: 'downloading',
      label: '720p',
      progress: null,
    });
    expect(mockFileSystem.lastDownload().url).toBe(option.url);
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
      attachmentId: 'list-1-attachment',
    });

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
