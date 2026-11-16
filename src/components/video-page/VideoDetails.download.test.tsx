import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';

import { VideoDetails } from '@/components/video-page/VideoDetails';
import { useStopDownloadsOnSignOut } from '@/hooks/use-video-download';
import type { usePostReaction } from '@/hooks/use-post-reaction';
import type { VideoPost } from '@/shared';
import {
  makeDownloadDelivery,
  makeVideo,
  makeVideoPost,
  techCreator,
  techMainChannel,
} from '@test/fixtures';
import { mockFileSystem } from '@test/mocks/expo-file-system';
import { mockMediaLibrary } from '@test/mocks/expo-media-library';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
// A signed-in session (the real module otherwise, for authenticatedFetch, theme colors, …).
jest.mock('@/shared', () => ({
  ...jest.requireActual<object>('@/shared'),
  useSession: () => ({ token: 'token' }),
}));

const video = makeVideo(techCreator, techMainChannel, { id: 'post-1', title: 'Home Lab Tour' });
const post = makeVideoPost(video);
const GUID = 'post-1-guid';

const reaction: ReturnType<typeof usePostReaction> = {
  reaction: null,
  likes: 1,
  dislikes: 0,
  isPending: false,
  error: null,
  toggle: jest.fn(),
};

const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL]>();

const urlOf = (input: RequestInfo | URL | undefined): string => {
  if (input === undefined || typeof input === 'string') {
    return input ?? '';
  }
  return input instanceof URL ? input.href : input.url;
};

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(makeDownloadDelivery(GUID)), { status: 200 })),
  );
  globalThis.fetch = fetchMock;
});

let client: QueryClient | undefined;

afterEach(async () => {
  client?.clear();
  // Downloads are app-wide: clear them for the next test.
  await renderHook(() => {
    useStopDownloadsOnSignOut(false);
  });
});

async function renderDetails(activePost: VideoPost = post) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <VideoDetails post={activePost} reaction={reaction} />
    </QueryClientProvider>,
  );
}

/** Open the quality list, pick `optionId` and wait for the transfer to start. */
async function startDownload(optionId: string): Promise<void> {
  await fireEvent.press(screen.getByTestId('download-button'));
  await waitFor(() => {
    expect(screen.getByTestId(`download-option-${optionId}`)).toBeTruthy();
  });
  await fireEvent.press(screen.getByTestId(`download-option-${optionId}`));
  await waitFor(() => {
    expect(mockFileSystem.downloads).toHaveLength(1);
  });
}

/** The transfer completes (the thumbnail is saved next to it). */
async function finish(task: ReturnType<typeof mockFileSystem.lastDownload>): Promise<void> {
  await act(async () => {
    task.finish();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('VideoDetails downloads', () => {
  it('posts without a video have no Download button', async () => {
    await renderDetails(makeVideoPost(video, { videoAttachments: false }));
    expect(screen.queryByTestId('download-button')).toBeNull();
  });

  it('fetches the qualities only when the sheet opens', async () => {
    await renderDetails();
    expect(screen.getByTestId('download-button')).toHaveTextContent('Download');
    expect(fetchMock).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('download-button'));
    await waitFor(() => {
      expect(screen.getByTestId('download-option-1080-avc1')).toBeTruthy();
    });
    expect(urlOf(fetchMock.mock.calls[0]?.[0])).toContain(`scenario=download&entityId=${GUID}`);
  });

  it('picking a quality closes the sheet and downloads it into the app', async () => {
    await renderDetails();
    await startDownload('720-avc1');
    expect(screen.queryByTestId('download-sheet')).toBeNull();

    const task = mockFileSystem.lastDownload();
    expect(task.url).toBe(
      'https://edge.floatplane.test/Videos/post-1-guid/720.mp4?token=signed-720',
    );
    await act(() => {
      task.progress(3, 4);
    });
    expect(screen.getByTestId('download-button')).toHaveTextContent('Downloading 75%');

    await finish(task);
    expect(screen.getByTestId('download-button')).toHaveTextContent('Downloaded');
    expect(mockFileSystem.files.has('file:///document/downloads/post-1.mp4')).toBe(true);
    expect(mockMediaLibrary.saved).toEqual([]);
    expect(screen.queryByTestId('download-status')).toBeNull();
  });

  it('Downloaded opens the actions menu; Delete download removes it', async () => {
    await renderDetails();
    await startDownload('720-avc1');
    await finish(mockFileSystem.lastDownload());

    await fireEvent.press(screen.getByTestId('download-button'));
    expect(screen.getByTestId('download-actions-note')).toHaveTextContent(
      '720p · 1000 B · Available offline',
    );
    expect(screen.getByRole('button', { name: 'Play download' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete download' }));

    expect(screen.queryByTestId('download-sheet')).toBeNull();
    expect(screen.getByTestId('download-button')).toHaveTextContent('Download');
    expect(mockFileSystem.files.has('file:///document/downloads/post-1.mp4')).toBe(false);
  });

  it('a failed transfer shows the failure line', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await renderDetails();
    await startDownload('1080-avc1');
    await act(async () => {
      mockFileSystem.lastDownload().fail();
      await Promise.resolve();
    });
    expect(screen.getByTestId('download-status')).toHaveTextContent(
      "Couldn't download 1080p. Try again.",
    );
    expect(screen.getByTestId('download-button')).toHaveTextContent('Download');
    errorSpy.mockRestore();
  });

  it('closing the sheet starts nothing', async () => {
    await renderDetails();
    await fireEvent.press(screen.getByTestId('download-button'));
    await fireEvent.press(screen.getByTestId('download-sheet-backdrop'));
    expect(screen.queryByTestId('download-sheet')).toBeNull();
    expect(mockFileSystem.downloads).toHaveLength(0);
  });

  it('Cancel stops a running download', async () => {
    await renderDetails();
    await startDownload('1080-avc1');
    await fireEvent.press(screen.getByTestId('download-cancel'));
    expect(mockFileSystem.lastDownload().state).toBe('cancelled');
    expect(screen.getByTestId('download-button')).toHaveTextContent('Download');
  });
});
