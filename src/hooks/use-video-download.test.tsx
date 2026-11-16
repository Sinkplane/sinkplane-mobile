import { act, renderHook } from '@testing-library/react-native';

import { useVideoDownload } from '@/hooks/use-video-download';
import { BROWSER_USER_AGENT } from '@/shared';
import type { DownloadedVideo } from '@/utils/download-library';
import {
  DOWNLOAD_NOW,
  DOWNLOADS_DIR,
  downloadTarget,
  finishDownload,
  indexOnDisk,
  OPTION_1080,
  OPTION_720,
  renderDownload,
  seedDownload,
  settle,
  startDownload,
  setUpDownloadStoreTests,
} from '@test/download-store';
import { MockFile, mockFileSystem } from '@test/mocks/expo-file-system';

const AUTHORIZATION = 'Authorization';
const { errorSpy } = setUpDownloadStoreTests();

describe('useVideoDownload', () => {
  it('starts idle', async () => {
    // Imported here directly (not only through @test/download-store) so Stryker's related-test
    // lookup, which doesn't follow jest/ helpers, runs this file against the store.
    const { result } = await renderHook(() => useVideoDownload(downloadTarget(), 'token'));
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('downloads with the session headers, then lists the video', async () => {
    const { result } = await startDownload();
    expect(result.current.state).toEqual({ status: 'downloading', label: '720p', progress: null });

    const task = mockFileSystem.lastDownload();
    expect(task.url).toBe(OPTION_720.url);
    expect(task.headers).toEqual({
      'User-Agent': BROWSER_USER_AGENT,
      [AUTHORIZATION]: 'Bearer token',
    });
    expect(task.destination.uri).toBe(`${DOWNLOADS_DIR}/post-1.mp4.part`);

    await act(() => {
      task.progress(40, 100);
    });
    expect(result.current.state).toEqual({ status: 'downloading', label: '720p', progress: 0.4 });

    await finishDownload();
    const video: DownloadedVideo = {
      postId: 'post-1',
      title: 'Home Lab Tour',
      channel: 'LTT',
      label: '720p',
      sizeBytes: 4321,
      durationSeconds: 600,
      downloadedAt: DOWNLOAD_NOW,
      hasThumbnail: true,
    };
    expect(result.current.state).toEqual({ status: 'downloaded', video });
    expect(indexOnDisk()).toEqual([video]);
    expect(mockFileSystem.files.has(`${DOWNLOADS_DIR}/post-1.mp4`)).toBe(true);
  });

  it('leaves out a missing channel and duration', async () => {
    await startDownload({ postId: 'post-1', title: 'T', attachmentId: 'a' });
    await finishDownload();
    expect(indexOnDisk()[0]).toEqual({
      postId: 'post-1',
      title: 'T',
      label: '720p',
      sizeBytes: 4321,
      downloadedAt: DOWNLOAD_NOW,
      hasThumbnail: false,
    });
  });

  it('sends no bearer without a session token', async () => {
    const { result } = await renderDownload(downloadTarget(), '');
    await act(() => {
      result.current.start(OPTION_720);
    });
    expect(mockFileSystem.lastDownload().headers).toEqual({ 'User-Agent': BROWSER_USER_AGENT });
  });

  it('without a target: idle, and every action is a no-op', async () => {
    const { result } = await renderDownload(null);
    await act(() => {
      result.current.start(OPTION_720);
      result.current.cancel();
      result.current.dismiss();
      result.current.remove();
    });
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(mockFileSystem.downloads).toHaveLength(0);
  });

  it('only re-renders for whole-percent progress steps', async () => {
    const { result } = await startDownload();
    const task = mockFileSystem.lastDownload();
    await act(() => {
      task.progress(101, 1000);
    });
    const tenPercent = result.current.state;
    await act(() => {
      task.progress(109, 1000);
    });
    expect(result.current.state).toBe(tenPercent);
    await act(() => {
      task.progress(110, 1000);
    });
    expect(result.current.state).toEqual({ status: 'downloading', label: '720p', progress: 0.11 });
  });

  it('keeps an unknown-size download at null progress', async () => {
    const { result } = await startDownload();
    const before = result.current.state;
    await act(() => {
      mockFileSystem.lastDownload().progress(500, -1);
    });
    expect(result.current.state).toBe(before);
  });

  it('a failed transfer shows the failure; dismiss clears it and it can start again', async () => {
    const { result } = await startDownload();
    await act(() => {
      mockFileSystem.lastDownload().fail();
    });
    await settle();
    expect(result.current.state).toEqual({ status: 'failed', label: '720p' });
    expect(errorSpy()).toHaveBeenCalledWith('[Downloads] Download failed', expect.any(Error));
    expect(indexOnDisk()).toEqual([]);

    await act(() => {
      result.current.dismiss();
    });
    expect(result.current.state).toEqual({ status: 'idle' });

    await act(() => {
      result.current.start(OPTION_1080);
    });
    expect(result.current.state).toMatchObject({ status: 'downloading', label: '1080p' });
  });

  it('a failed download can be retried directly', async () => {
    const { result } = await startDownload();
    await act(() => {
      mockFileSystem.lastDownload().fail();
    });
    await settle();
    await act(() => {
      result.current.start(OPTION_1080);
    });
    expect(mockFileSystem.downloads).toHaveLength(2);
  });

  it('dismiss leaves running and downloaded states alone', async () => {
    const { result } = await startDownload();
    await act(() => {
      result.current.dismiss();
    });
    expect(result.current.state.status).toBe('downloading');
    await finishDownload();
    await act(() => {
      result.current.dismiss();
    });
    expect(result.current.state.status).toBe('downloaded');
  });

  it('cancel stops the transfer and goes back to idle', async () => {
    const { result } = await startDownload();
    const task = mockFileSystem.lastDownload();
    await act(() => {
      result.current.cancel();
    });
    await settle();
    expect(task.state).toBe('cancelled');
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(errorSpy()).not.toHaveBeenCalled();

    // A late progress event from the cancelled task changes nothing.
    await act(() => {
      task.progress(50, 100);
    });
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('cancel does nothing to a downloaded video', async () => {
    const { result } = await startDownload();
    await finishDownload();
    await act(() => {
      result.current.cancel();
    });
    expect(result.current.state.status).toBe('downloaded');
  });

  it('restarting right after a cancel runs the new transfer only', async () => {
    const { result } = await startDownload();
    const first = mockFileSystem.lastDownload();
    await act(() => {
      result.current.cancel();
      result.current.start(OPTION_1080);
    });
    await settle();
    expect(mockFileSystem.downloads.map((task) => task.url)).toEqual([
      OPTION_720.url,
      OPTION_1080.url,
    ]);
    expect(first.state).toBe('cancelled');
    expect(result.current.state).toEqual({ status: 'downloading', label: '1080p', progress: null });
  });

  it('a failure or progress of a replaced attempt is ignored', async () => {
    const { result } = await startDownload();
    const first = mockFileSystem.lastDownload();
    await act(() => {
      result.current.cancel();
      result.current.start(OPTION_1080);
    });
    await act(() => {
      first.progress(90, 100);
      first.fail();
    });
    await settle();
    expect(result.current.state).toEqual({ status: 'downloading', label: '1080p', progress: null });
    expect(errorSpy()).not.toHaveBeenCalled();
  });

  it('cancelled while the thumbnail is saved: no video is kept', async () => {
    let finishThumbnail: () => void = () => undefined;
    const thumbnail = jest.spyOn(MockFile, 'downloadFileAsync');
    thumbnail.mockImplementationOnce(
      (_url, destination) =>
        new Promise((resolve) => {
          finishThumbnail = () => {
            resolve(destination);
          };
        }),
    );
    const { result } = await startDownload();
    await finishDownload();
    expect(result.current.state.status).toBe('downloading');
    await act(() => {
      result.current.cancel();
    });
    await act(() => {
      finishThumbnail();
    });
    await settle();
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(mockFileSystem.files.has(`${DOWNLOADS_DIR}/post-1.mp4`)).toBe(false);
    expect(indexOnDisk()).toEqual([]);
    thumbnail.mockRestore();
  });

  it('ignores a start while downloading or downloaded', async () => {
    const { result } = await startDownload();
    await act(() => {
      result.current.start(OPTION_1080);
    });
    expect(mockFileSystem.downloads).toHaveLength(1);
    await finishDownload();
    await act(() => {
      result.current.start(OPTION_1080);
    });
    expect(mockFileSystem.downloads).toHaveLength(1);
    expect(result.current.state).toMatchObject({ video: { label: '720p' } });
  });

  it('remove deletes the files and the index entry; only a downloaded video', async () => {
    const { result } = await startDownload();
    await act(() => {
      result.current.remove();
    });
    expect(result.current.state.status).toBe('downloading');

    await finishDownload();
    await act(() => {
      result.current.remove();
    });
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(indexOnDisk()).toEqual([]);
    expect(mockFileSystem.files.has(`${DOWNLOADS_DIR}/post-1.mp4`)).toBe(false);
    expect(mockFileSystem.files.has(`${DOWNLOADS_DIR}/post-1.jpg`)).toBe(false);
  });

  it('outlives the component: a remount shows the running download', async () => {
    const first = await startDownload();
    await first.unmount();
    await act(() => {
      mockFileSystem.lastDownload().progress(1, 2);
    });
    const { result } = await renderDownload();
    expect(result.current.state).toEqual({ status: 'downloading', label: '720p', progress: 0.5 });
  });

  it('tracks posts separately', async () => {
    await startDownload(downloadTarget('post-1'));
    const { result } = await renderDownload(downloadTarget('post-2'));
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('reads downloads an earlier run left on disk', async () => {
    const video = seedDownload('post-1');
    const { result } = await renderDownload();
    expect(result.current.state).toEqual({ status: 'downloaded', video });
  });
});
