/**
 * The downloads store's file hygiene: failed index writes, undeletable videos, abandoned transfers,
 * and cancelled attempts that finish anyway.
 */
import { act, renderHook } from '@testing-library/react-native';

import {
  deleteAllDownloads,
  useDownloadedVideos,
  useStopDownloadsOnSignOut,
  useVideoDownload,
} from '@/hooks/use-video-download';
import {
  DOWNLOADS_DIR,
  downloadTarget,
  failVideoDeletes,
  finishDownload,
  holdNextThumbnail,
  indexOnDisk,
  OPTION_1080,
  renderDownload,
  seedDownload,
  settle,
  startDownload,
  setUpDownloadStoreTests,
} from '@test/download-store';
import { mockFileSystem } from '@test/mocks/expo-file-system';

const { errorSpy } = setUpDownloadStoreTests();

const VIDEO = `${DOWNLOADS_DIR}/post-1.mp4`;
const THUMBNAIL = `${DOWNLOADS_DIR}/post-1.jpg`;
const exists = (uri: string): boolean => mockFileSystem.files.has(uri);
const postIds = (videos: readonly { postId: string }[]): string[] =>
  videos.map((video) => video.postId);

describe('a download whose index cannot be written', () => {
  it('is deleted, not listed, and reported as failed', async () => {
    const { result } = await startDownload();
    const list = await renderHook(() => useDownloadedVideos());
    mockFileSystem.writeError = new Error('Disk full');
    await finishDownload();

    expect(result.current.state).toEqual({ status: 'failed', label: '720p' });
    expect(list.result.current).toEqual([]);
    expect(exists(VIDEO)).toBe(false);
    expect(exists(THUMBNAIL)).toBe(false);
    expect(errorSpy()).toHaveBeenCalledWith(
      '[Downloads] Could not write the downloads index',
      mockFileSystem.writeError,
    );
    expect(mockFileSystem.lastDownload().acknowledged).toBe(1);
  });
});

describe('remove / removeAll with a video that cannot be deleted', () => {
  it('remove keeps the download listed, with its files and index entry', async () => {
    const video = seedDownload('post-1');
    const { result } = await renderDownload();
    failVideoDeletes(['post-1']);
    await act(() => {
      result.current.remove();
    });
    expect(result.current.state).toEqual({ status: 'downloaded', video });
    expect(indexOnDisk()).toEqual([video]);
    expect(exists(VIDEO)).toBe(true);
  });

  it('removeAll keeps exactly the entries whose video stayed', async () => {
    seedDownload('post-a');
    const stuck = seedDownload('post-b');
    seedDownload('post-c');
    const list = await renderHook(() => useDownloadedVideos());
    failVideoDeletes(['post-b']);
    await act(() => {
      deleteAllDownloads();
    });
    expect(list.result.current).toEqual([stuck]);
    expect(indexOnDisk()).toEqual([stuck]);
    expect(exists(`${DOWNLOADS_DIR}/post-a.mp4`)).toBe(false);
    expect(exists(`${DOWNLOADS_DIR}/post-b.mp4`)).toBe(true);
    expect(exists(`${DOWNLOADS_DIR}/post-c.mp4`)).toBe(false);
  });
});

describe('abandoned transfers', () => {
  const ABANDONED = `${DOWNLOADS_DIR}/post-9.4.part`;

  it('the first load deletes them and keeps everything else', async () => {
    const video = seedDownload('post-1');
    mockFileSystem.files.set(ABANDONED, 'half');
    const list = await renderHook(() => useDownloadedVideos());
    expect(exists(ABANDONED)).toBe(false);
    expect(list.result.current).toEqual([video]);
    expect(exists(VIDEO)).toBe(true);
  });

  it('a running download keeps its .part file when another screen mounts', async () => {
    await startDownload();
    const part = mockFileSystem.lastDownload().destination.uri;
    mockFileSystem.files.set(part, 'half');
    await renderHook(() => useDownloadedVideos());
    expect(exists(part)).toBe(true);
  });

  it('the first use after a sign-out deletes them again', async () => {
    const first = await renderHook(() => useDownloadedVideos());
    await first.unmount();
    const signOut = await renderHook(
      ({ signedIn }: { signedIn: boolean }) => {
        useStopDownloadsOnSignOut(signedIn);
      },
      { initialProps: { signedIn: true } },
    );
    await signOut.rerender({ signedIn: false });
    mockFileSystem.files.set(ABANDONED, 'half');
    await renderHook(() => useDownloadedVideos());
    expect(exists(ABANDONED)).toBe(false);
  });
});

describe('cancelled and failed downloads clean up the post', () => {
  it('cancel deletes the post files an earlier cancelled attempt left', async () => {
    const { result } = await startDownload();
    mockFileSystem.files.set(VIDEO, 'video');
    mockFileSystem.files.set(THUMBNAIL, 'thumbnail');
    await act(() => {
      result.current.cancel();
    });
    expect(exists(VIDEO)).toBe(false);
    expect(exists(THUMBNAIL)).toBe(false);
  });

  it('a failed transfer deletes the post files', async () => {
    await startDownload();
    mockFileSystem.files.set(VIDEO, 'video');
    mockFileSystem.files.set(THUMBNAIL, 'thumbnail');
    await act(() => {
      mockFileSystem.lastDownload().fail();
    });
    await settle();
    expect(exists(VIDEO)).toBe(false);
    expect(exists(THUMBNAIL)).toBe(false);
  });
});

describe('a cancelled attempt that finishes anyway', () => {
  /** Attempt 1 finished its video and is saving the thumbnail when it is cancelled. */
  async function cancelledDuringThumbnail() {
    const finishThumbnail = holdNextThumbnail();
    const hook = await startDownload();
    await finishDownload();
    await act(() => {
      hook.result.current.cancel();
    });
    return { hook, finishThumbnail };
  }

  it('leaves the files to a newer download that is running', async () => {
    const { hook, finishThumbnail } = await cancelledDuringThumbnail();
    await act(() => {
      hook.result.current.start(OPTION_1080);
    });
    mockFileSystem.files.set(VIDEO, 'video');
    await finishThumbnail();
    expect(hook.result.current.state).toMatchObject({ status: 'downloading', label: '1080p' });
    expect(exists(VIDEO)).toBe(true);
    expect(exists(THUMBNAIL)).toBe(true);
  });

  it('leaves the files to a newer download that is done', async () => {
    const { hook, finishThumbnail } = await cancelledDuringThumbnail();
    await act(() => {
      hook.result.current.start(OPTION_1080);
    });
    await finishDownload(777);
    await finishThumbnail();
    expect(hook.result.current.state).toMatchObject({ status: 'downloaded' });
    expect(exists(VIDEO)).toBe(true);
    expect(exists(THUMBNAIL)).toBe(true);
    expect(indexOnDisk()).toHaveLength(1);
  });

  it('deletes the files when the post is failed by then', async () => {
    const { hook, finishThumbnail } = await cancelledDuringThumbnail();
    await act(() => {
      hook.result.current.start(OPTION_1080);
    });
    await act(() => {
      mockFileSystem.lastDownload().fail();
    });
    await settle();
    mockFileSystem.files.set(VIDEO, 'video');
    await finishThumbnail();
    expect(hook.result.current.state).toEqual({ status: 'failed', label: '1080p' });
    expect(exists(VIDEO)).toBe(false);
    expect(exists(THUMBNAIL)).toBe(false);
  });

  it('lists nothing and keeps no files when the post is idle', async () => {
    const { hook, finishThumbnail } = await cancelledDuringThumbnail();
    await finishThumbnail();
    expect(hook.result.current.state).toEqual({ status: 'idle' });
    expect(postIds(indexOnDisk())).toEqual([]);
    expect(exists(VIDEO)).toBe(false);
    expect(exists(THUMBNAIL)).toBe(false);
  });
});

it('imports the store hook directly', async () => {
  // Stryker's related-test lookup doesn't follow jest/ helpers; this import ties the file to the store.
  const { result } = await renderHook(() => useVideoDownload(downloadTarget(), 'token'));
  expect(result.current.state).toEqual({ status: 'idle' });
});
