import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { VideoPageData } from '@/components/video-page/use-video-page-data';
import { VideoComments } from '@/components/video-page/VideoComments';
import type { PostComment } from '@/hooks/use-post-comments';
import {
  makeComments,
  makeVideo,
  makeVideoPost,
  techCreator,
  techMainChannel,
} from '@test/fixtures';
import { Alert } from 'react-native';
import { pressAlertButton, spyOnAlert } from '@test/alert';
import { makeDownloadedVideo, seedDownloads } from '@test/fixtures-downloads';
import { mockFileSystem } from '@test/mocks/expo-file-system';
import { mockNetwork } from '@test/mocks/expo-network';

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn<boolean, []>(),
};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, bottom: 34, left: 0, right: 0 },
};

const post = makeVideoPost(
  makeVideo(techCreator, techMainChannel, { id: 'p1', title: 'Home Lab Tour' }),
);
const commentsFor = (n: number): PostComment[] => makeComments('p1', n);

const refetch = jest.fn();
const fetchNextPage = jest.fn();

const queryResult = (over: Record<string, unknown> = {}) => ({
  isLoading: false,
  isFetchingNextPage: false,
  isError: false,
  hasNextPage: false,
  data: undefined,
  refetch,
  fetchNextPage,
  ...over,
});

function pageData(over: Partial<VideoPageData> | Record<string, unknown> = {}): VideoPageData {
  return {
    token: 'tok',
    offline: false,
    postData: post,
    download: undefined,
    comments: queryResult(),
    loadedComments: undefined,
    savedComments: undefined,
    reaction: {
      reaction: null,
      likes: 1,
      dislikes: 0,
      isPending: false,
      error: null,
      toggle: jest.fn(),
    },
    ...over,
  } as unknown as VideoPageData;
}

const clients: QueryClient[] = [];

afterEach(() => {
  for (const client of clients.splice(0)) {
    client.clear();
  }
  jest.clearAllMocks();
});

async function renderComments(data: VideoPageData) {
  const client = new QueryClient();
  clients.push(client);
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={client}>
        <VideoComments data={data} />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('VideoComments', () => {
  it('lists the loaded comments under the post details', async () => {
    const loaded = commentsFor(2);
    await renderComments(
      pageData({
        loadedComments: loaded,
        comments: queryResult({ data: { pages: [loaded] } }),
      }),
    );

    expect(screen.getByTestId('video-title')).toHaveTextContent('Home Lab Tour');
    expect(screen.getByTestId('comment-p1-comment-1')).toBeTruthy();
    expect(screen.getByTestId('comment-p1-comment-2')).toBeTruthy();
    expect(screen.queryByText('No comments yet.')).toBeNull();
    expect(screen.getByTestId('comment-p1-comment-1-like')).toBeEnabled();
  });

  it('offline: lists the saved comments, disabled, with no spinner or error', async () => {
    mockNetwork.offline();
    await renderComments(
      pageData({
        offline: true,
        savedComments: commentsFor(2),
        comments: queryResult({ isLoading: true, isError: true }),
      }),
    );

    expect(screen.getByTestId('comment-p1-comment-1')).toBeTruthy();
    expect(screen.getByTestId('comment-p1-comment-1-like')).toBeDisabled();
    expect(screen.getByTestId('comment-p1-comment-2-dislike')).toBeDisabled();
    expect(screen.queryByTestId('comments-retry')).toBeNull();
    expect(screen.queryByText('No comments yet.')).toBeNull();
    expect(screen.getByTestId('reaction-like')).toBeDisabled();
  });

  it('saved comments that are an empty list settle on "No comments yet."', async () => {
    await renderComments(
      pageData({ savedComments: [], comments: queryResult({ isLoading: true }) }),
    );
    expect(screen.getByText('No comments yet.')).toBeTruthy();
  });

  it('with no saved comments either, the footer follows the live query', async () => {
    await renderComments(pageData({ comments: queryResult({ isError: true }) }));
    expect(screen.getByTestId('comments-retry')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('comments-retry'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('loaded comments win over saved ones, and the footer follows the live query', async () => {
    const loaded = commentsFor(1);
    await renderComments(
      pageData({
        loadedComments: loaded,
        savedComments: commentsFor(2),
        comments: queryResult({ data: { pages: [loaded] }, isError: true }),
      }),
    );
    expect(screen.queryByTestId('comment-p1-comment-2')).toBeNull();
    expect(screen.getByTestId('comments-retry')).toBeTruthy();
  });

  it('with no post, shows the download’s details', async () => {
    const download = makeDownloadedVideo({ postId: 'p1', title: 'Saved Title' });
    await renderComments(pageData({ postData: undefined, download }));

    expect(screen.getByTestId('downloaded-video-details')).toHaveTextContent(/Saved Title/);
    expect(screen.queryByTestId('video-title')).toBeNull();
  });

  describe('deleting the download from its details', () => {
    async function deleteDownload(): Promise<void> {
      const alert = spyOnAlert(Alert);
      const download = makeDownloadedVideo({ postId: 'p1' });
      seedDownloads(mockFileSystem, [download]);
      await renderComments(pageData({ postData: undefined, download }));

      await fireEvent.press(screen.getByTestId('downloaded-delete'));
      await act(async () => {
        pressAlertButton(alert, 'Delete');
        await Promise.resolve();
      });
      alert.mockRestore();
    }

    it('goes back when there is a screen to go back to', async () => {
      mockRouter.canGoBack.mockReturnValue(true);
      await deleteDownload();
      expect(mockRouter.back).toHaveBeenCalledTimes(1);
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    it('opened directly (nothing to go back to), replaces with the start screen', async () => {
      mockRouter.canGoBack.mockReturnValue(false);
      await deleteDownload();
      expect(mockRouter.replace).toHaveBeenCalledWith('/');
      expect(mockRouter.back).not.toHaveBeenCalled();
    });
  });

  it('with the post, shows its details even when downloaded', async () => {
    await renderComments(pageData({ download: makeDownloadedVideo({ postId: 'p1' }) }));
    expect(screen.getByTestId('video-title')).toBeTruthy();
    expect(screen.queryByTestId('downloaded-video-details')).toBeNull();
  });

  it('with neither a post nor a download, shows no header', async () => {
    await renderComments(pageData({ postData: undefined }));
    expect(screen.queryByTestId('video-title')).toBeNull();
    expect(screen.queryByTestId('downloaded-video-details')).toBeNull();
  });

  describe('paging', () => {
    const list = () => screen.getByTestId('comment-list');

    it('loads the next page at the end of the list', async () => {
      await renderComments(pageData({ comments: queryResult({ hasNextPage: true }) }));
      await fireEvent(list(), 'endReached');
      expect(fetchNextPage).toHaveBeenCalledTimes(1);
    });

    it('not when there is none, or one is already loading', async () => {
      await renderComments(pageData({ comments: queryResult({ hasNextPage: false }) }));
      await fireEvent(list(), 'endReached');
      await screen.unmount();

      await renderComments(
        pageData({ comments: queryResult({ hasNextPage: true, isFetchingNextPage: true }) }),
      );
      await fireEvent(list(), 'endReached');
      expect(fetchNextPage).not.toHaveBeenCalled();
    });
  });
});
