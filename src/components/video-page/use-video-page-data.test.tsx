import { renderHook } from '@testing-library/react-native';

import { commentsToShow, useVideoPageData } from '@/components/video-page/use-video-page-data';
import type { PostComment } from '@/hooks/use-post-comments';
import type { VideoPost } from '@/shared';
import {
  makeComments,
  makeVideo,
  makeVideoDelivery,
  makeVideoPost,
  techCreator,
  techMainChannel,
} from '@test/fixtures';
import { makeDownloadedVideo } from '@test/fixtures-downloads';

const mockOffline = jest.fn<boolean, []>();
jest.mock('@/hooks/use-offline', () => ({ useIsOffline: () => mockOffline() }));

const mockPostCache = jest.fn();
jest.mock('@/hooks/use-post-cache', () => ({
  usePostCache: (...args: unknown[]): unknown => mockPostCache(...args),
}));

const mockComments = jest.fn();
jest.mock('@/hooks/use-post-comments', () => ({
  usePostComments: (...args: unknown[]): unknown => mockComments(...args),
}));

const mockReaction = jest.fn();
jest.mock('@/hooks/use-post-reaction', () => ({
  usePostReaction: (...args: unknown[]): unknown => mockReaction(...args),
}));

const mockResume = jest.fn();
jest.mock('@/hooks/use-resume-position', () => ({
  useResumePosition: (...args: unknown[]): unknown => mockResume(...args),
}));

const mockSuggested = jest.fn();
jest.mock('@/hooks/use-suggested-videos', () => ({
  useSuggestedVideos: (...args: unknown[]): unknown => mockSuggested(...args),
}));

const mockDownloaded = jest.fn();
jest.mock('@/hooks/use-video-download', () => ({
  useDownloadedVideo: (...args: unknown[]): unknown => mockDownloaded(...args),
}));

const mockGetPost = jest.fn();
const mockGetDelivery = jest.fn();
jest.mock('@/shared', () => ({
  ...jest.requireActual<object>('@/shared'),
  useSession: () => ({ token: 'tok', tokenExpiration: '2030-01-01T00:00:00.000Z' }),
  useGetVideoPost: (...args: unknown[]): unknown => mockGetPost(...args),
  useGetVideoDelivery: (...args: unknown[]): unknown => mockGetDelivery(...args),
}));

const post: VideoPost = makeVideoPost(
  makeVideo(techCreator, techMainChannel, { id: 'p1', title: 'Online title' }),
);
const savedPost: VideoPost = makeVideoPost(
  makeVideo(techCreator, techMainChannel, { id: 'p1', title: 'Saved title' }),
);
const GUID = 'p1-guid';
const comments = (n: number): PostComment[] => makeComments('p1', n);
const EXPIRATION = '2030-01-01T00:00:00.000Z';

const commentsQuery = (pages: PostComment[][] | undefined) => ({
  data: pages === undefined ? undefined : { pages, pageParams: [] },
  marker: 'comments-query',
});

beforeEach(() => {
  mockOffline.mockReset().mockReturnValue(false);
  mockPostCache.mockReset().mockReturnValue(undefined);
  mockComments.mockReset().mockReturnValue(commentsQuery(undefined));
  mockReaction.mockReset().mockReturnValue({ marker: 'reaction' });
  mockResume.mockReset().mockReturnValue({ ready: true, seconds: 12 });
  mockSuggested.mockReset().mockReturnValue([]);
  mockDownloaded.mockReset().mockReturnValue(undefined);
  mockGetPost.mockReset().mockReturnValue({ data: post });
  mockGetDelivery.mockReset().mockReturnValue({ data: makeVideoDelivery(GUID) });
});

const render = () => renderHook(() => useVideoPageData('p1'));

describe('useVideoPageData', () => {
  it('online: the post, its stream and the session as the hooks need them', async () => {
    const { result } = await render();
    const data = result.current;

    expect(data.token).toBe('tok');
    expect(data.offline).toBe(false);
    expect(data.postData).toBe(post);
    expect(data.attachment?.guid).toBe(GUID);
    expect(data.download).toBeUndefined();
    expect(data.streamUrl).toContain(`/${GUID}/1080.m3u8`);
    expect(data.reaction).toEqual({ marker: 'reaction' });
    expect(data.resume).toEqual({ ready: true, seconds: 12 });
    expect(data.suggested).toEqual([]);
    expect(mockGetPost).toHaveBeenCalledWith('tok', EXPIRATION, 'p1');
    expect(mockGetDelivery).toHaveBeenCalledWith('tok', EXPIRATION, GUID);
    expect(mockComments).toHaveBeenCalledWith('tok', 'p1');
    expect(mockReaction).toHaveBeenCalledWith('tok', post);
    expect(mockResume).toHaveBeenCalledWith('tok', 'p1', post);
    expect(mockSuggested).toHaveBeenCalledWith('tok', EXPIRATION, 'p1');
    expect(mockDownloaded).toHaveBeenCalledWith('p1');
  });

  it('passes the loaded post and flattened comments to the post cache', async () => {
    mockComments.mockReturnValue(commentsQuery([comments(2), makeComments('p1', 1)]));
    const { result } = await render();

    const loaded = result.current.loadedComments;
    expect(loaded).toHaveLength(3);
    expect(mockPostCache).toHaveBeenCalledWith('p1', post, loaded);
  });

  it('keeps the flattened comments stable between renders', async () => {
    mockComments.mockReturnValue(commentsQuery([comments(2)]));
    const { result, rerender } = await renderHook(() => useVideoPageData('p1'));
    const first = result.current.loadedComments;
    await rerender({});
    expect(result.current.loadedComments).toBe(first);
  });

  describe('the saved copy', () => {
    const SAVED = { post: savedPost, comments: comments(2), savedAt: 'x' };

    beforeEach(() => {
      mockGetPost.mockReturnValue({ data: undefined, isError: false });
      mockPostCache.mockReturnValue(SAVED);
    });

    it('online and still loading: waits for Floatplane, using neither saved post nor comments', async () => {
      const { result } = await render();

      expect(result.current.postData).toBeUndefined();
      expect(result.current.savedComments).toBeUndefined();
      expect(mockReaction).toHaveBeenCalledWith('tok', undefined);
      expect(mockResume).toHaveBeenCalledWith('tok', 'p1', undefined);
      expect(mockGetDelivery).toHaveBeenCalledWith('tok', EXPIRATION, undefined);
    });

    it('online and the post request failed: uses the saved post', async () => {
      mockGetPost.mockReturnValue({ data: undefined, isError: true });
      const { result } = await render();

      expect(result.current.postData).toBe(savedPost);
      expect(result.current.savedComments).toBeUndefined();
      expect(mockReaction).toHaveBeenCalledWith('tok', savedPost);
      expect(mockGetDelivery).toHaveBeenCalledWith('tok', EXPIRATION, GUID);
    });

    it('online and the comments request failed: uses the saved comments', async () => {
      mockComments.mockReturnValue({ ...commentsQuery(undefined), isError: true });
      const { result } = await render();

      expect(result.current.savedComments).toHaveLength(2);
      expect(result.current.postData).toBeUndefined();
    });

    it('offline: uses the saved post and comments at once', async () => {
      mockOffline.mockReturnValue(true);
      const { result } = await render();

      expect(result.current.postData).toBe(savedPost);
      expect(result.current.savedComments).toHaveLength(2);
      expect(mockReaction).toHaveBeenCalledWith('tok', savedPost);
      expect(mockGetDelivery).toHaveBeenCalledWith('tok', EXPIRATION, GUID);
    });

    it('has nothing to fall back to when no copy was saved', async () => {
      mockPostCache.mockReturnValue(undefined);
      mockOffline.mockReturnValue(true);
      const { result } = await render();

      expect(result.current.postData).toBeUndefined();
      expect(result.current.savedComments).toBeUndefined();
    });
  });

  it('prefers the loaded post over the saved one', async () => {
    mockPostCache.mockReturnValue({ post: savedPost, comments: [], savedAt: 'x' });
    const { result } = await render();
    expect(result.current.postData).toBe(post);
  });

  it('with neither, has no post data, attachment or stream to fetch', async () => {
    mockGetPost.mockReturnValue({ data: undefined });
    mockGetDelivery.mockReturnValue({ data: undefined });
    const { result } = await render();

    expect(result.current.postData).toBeUndefined();
    expect(result.current.attachment).toBeUndefined();
    expect(result.current.streamUrl).toBeNull();
    expect(mockGetDelivery).toHaveBeenCalledWith('tok', EXPIRATION, undefined);
  });

  it('a post without attachments has none to stream', async () => {
    mockGetPost.mockReturnValue({ data: { ...post, videoAttachments: null } });
    const { result } = await render();
    expect(result.current.attachment).toBeUndefined();
  });

  it('a downloaded video never fetches its stream', async () => {
    const download = makeDownloadedVideo({ postId: 'p1' });
    mockDownloaded.mockReturnValue(download);
    const { result } = await render();

    expect(result.current.download).toBe(download);
    expect(mockGetDelivery).toHaveBeenCalledWith('tok', EXPIRATION, undefined);
  });

  it('offline: reports it and skips the resume lookup (the token is withheld)', async () => {
    mockOffline.mockReturnValue(true);
    const { result } = await render();

    expect(result.current.offline).toBe(true);
    expect(mockResume).toHaveBeenCalledWith(undefined, 'p1', post);
  });
});

describe('useVideoPageData › start position', () => {
  it('follows the lookup until it is ready', async () => {
    mockResume.mockReturnValue({ ready: false, seconds: undefined });
    const { result, rerender } = await render();
    expect(result.current.resume).toEqual({ ready: false, seconds: undefined });

    mockResume.mockReturnValue({ ready: true, seconds: 30 });
    await rerender({});
    expect(result.current.resume).toEqual({ ready: true, seconds: 30 });
  });

  it('keeps the first ready position: a later lookup turning not ready does not unmount the player', async () => {
    mockOffline.mockReturnValue(true);
    mockResume.mockReturnValue({ ready: true, seconds: undefined });
    const { result, rerender } = await render();
    expect(result.current.resume).toEqual({ ready: true, seconds: undefined });

    // Back online: the lookup starts over (not ready) with a position from the server.
    mockOffline.mockReturnValue(false);
    mockResume.mockReturnValue({ ready: false, seconds: undefined });
    await rerender({});
    expect(result.current.resume).toEqual({ ready: true, seconds: undefined });
    expect(mockResume).toHaveBeenLastCalledWith('tok', 'p1', post);

    mockResume.mockReturnValue({ ready: true, seconds: 99 });
    await rerender({});
    expect(result.current.resume).toEqual({ ready: true, seconds: undefined });
  });
});

describe('commentsToShow', () => {
  const base = { loadedComments: undefined, savedComments: undefined };

  it('lists the loaded comments', () => {
    const loaded = comments(1);
    const data = { ...base, loadedComments: loaded, savedComments: comments(2) };
    expect(commentsToShow(data as never)).toBe(loaded);
  });

  it('else the saved ones', () => {
    const saved = comments(2);
    expect(commentsToShow({ ...base, savedComments: saved } as never)).toBe(saved);
  });

  it('else none', () => {
    expect(commentsToShow(base as never)).toEqual([]);
  });

  it('an empty loaded list wins over the saved ones', () => {
    expect(
      commentsToShow({ ...base, loadedComments: [], savedComments: comments(2) } as never),
    ).toEqual([]);
  });
});
