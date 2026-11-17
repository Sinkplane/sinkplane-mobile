import { act, renderHook } from '@testing-library/react-native';

import {
  deleteAllDownloads,
  deleteDownload,
  useDownloadedVideo,
  useDownloadState,
  useDownloadedVideos,
  useStopDownloadsOnSignOut,
} from '@/hooks/use-video-download';
import {
  DOWNLOADS_DIR,
  downloadTarget,
  finishDownload,
  indexOnDisk,
  seedDownload,
  settle,
  startDownload,
  setUpDownloadStoreTests,
} from '@test/download-store';
import { mockFileSystem } from '@test/mocks/expo-file-system';

setUpDownloadStoreTests();

describe('useDownloadState', () => {
  it('follows one post by id: idle, downloading with progress, downloaded, idle again', async () => {
    const state = await renderHook(() => useDownloadState('post-1'));
    const other = await renderHook(() => useDownloadState('post-2'));
    expect(state.result.current).toEqual({ status: 'idle' });

    await startDownload(downloadTarget('post-1'));
    expect(state.result.current).toEqual({ status: 'downloading', label: '720p', progress: null });
    await act(() => {
      mockFileSystem.lastDownload().progress(1, 4);
    });
    expect(state.result.current).toEqual({ status: 'downloading', label: '720p', progress: 0.25 });
    expect(other.result.current).toEqual({ status: 'idle' });

    await finishDownload();
    expect(state.result.current).toMatchObject({
      status: 'downloaded',
      video: { postId: 'post-1' },
    });
    expect(other.result.current).toEqual({ status: 'idle' });

    await act(() => {
      deleteDownload('post-1');
    });
    await settle();
    expect(state.result.current).toEqual({ status: 'idle' });
  });

  it('knows a download left on disk by an earlier run', async () => {
    const video = seedDownload('post-old');
    const state = await renderHook(() => useDownloadState('post-old'));
    await settle();
    expect(state.result.current).toEqual({ status: 'downloaded', video });
  });
});

describe('useDownloadedVideos / useDownloadedVideo', () => {
  it('lists every download newest first, and updates as downloads finish and go', async () => {
    const older = seedDownload('post-old', '2026-11-01T00:00:00.000Z');
    const newer = seedDownload('post-new', '2026-11-10T00:00:00.000Z');
    const list = await renderHook(() => useDownloadedVideos());
    expect(list.result.current).toEqual([newer, older]);
    const same = list.result.current;
    await list.rerender({});
    expect(list.result.current).toBe(same);

    await startDownload(downloadTarget('post-1'));
    await finishDownload();
    expect(list.result.current.map((video) => video.postId)).toEqual([
      'post-1',
      'post-new',
      'post-old',
    ]);

    await act(() => {
      deleteDownload('post-new');
    });
    expect(list.result.current.map((video) => video.postId)).toEqual(['post-1', 'post-old']);
    expect(indexOnDisk().map((video) => video.postId)).toEqual(['post-1', 'post-old']);
  });

  it('a single post: its video, or undefined', async () => {
    const video = seedDownload('post-1');
    const one = await renderHook(({ postId }: { postId: string }) => useDownloadedVideo(postId), {
      initialProps: { postId: 'post-1' },
    });
    expect(one.result.current).toEqual(video);
    await one.rerender({ postId: 'post-2' });
    expect(one.result.current).toBeUndefined();
    await startDownload(downloadTarget('post-2'));
    expect(one.result.current).toBeUndefined();
  });

  it('deleteAllDownloads removes every downloaded video but not a running download', async () => {
    seedDownload('post-a');
    seedDownload('post-b');
    const running = await startDownload(downloadTarget('post-1'));
    const list = await renderHook(() => useDownloadedVideos());
    await act(() => {
      deleteAllDownloads();
    });
    expect(list.result.current).toEqual([]);
    expect(indexOnDisk()).toEqual([]);
    expect(mockFileSystem.files.has(`${DOWNLOADS_DIR}/post-a.mp4`)).toBe(false);
    expect(mockFileSystem.files.has(`${DOWNLOADS_DIR}/post-b.mp4`)).toBe(false);
    expect(running.result.current.state.status).toBe('downloading');
  });

  it('deleteDownload of a post without a download does nothing', async () => {
    const video = seedDownload('post-a');
    await act(() => {
      deleteDownload('post-missing');
    });
    const list = await renderHook(() => useDownloadedVideos());
    expect(list.result.current).toEqual([video]);
  });
});

describe('useStopDownloadsOnSignOut', () => {
  it('signed in: leaves downloads running', async () => {
    await startDownload();
    await renderHook(() => {
      useStopDownloadsOnSignOut(true);
    });
    expect(mockFileSystem.lastDownload().state).toBe('active');
  });

  it('signing out cancels transfers and forgets failures, but keeps downloaded videos', async () => {
    const kept = seedDownload('post-kept');
    const failing = await startDownload(downloadTarget('post-failed'));
    await act(() => {
      mockFileSystem.lastDownload().fail();
    });
    await settle();
    const running = await startDownload(downloadTarget('post-running'));
    const task = mockFileSystem.lastDownload();

    const signOut = await renderHook(
      ({ signedIn }: { signedIn: boolean }) => {
        useStopDownloadsOnSignOut(signedIn);
      },
      { initialProps: { signedIn: true } },
    );
    await signOut.rerender({ signedIn: false });
    await settle();

    expect(task.state).toBe('cancelled');
    expect(running.result.current.state).toEqual({ status: 'idle' });
    expect(failing.result.current.state).toEqual({ status: 'idle' });
    const list = await renderHook(() => useDownloadedVideos());
    expect(list.result.current).toEqual([kept]);
  });
});
