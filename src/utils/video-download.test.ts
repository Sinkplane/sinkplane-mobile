import { MockFile, mockFileSystem } from '@test/mocks/expo-file-system';
import { mockMediaLibrary } from '@test/mocks/expo-media-library';
import {
  DownloadCancelledError,
  downloadVideo,
  saveToPhotoLibrary,
  type DownloadedFiles,
} from '@/utils/video-download';

const AUTHORIZATION = 'Authorization';
const DIR = 'file:///document/downloads';
const PARTIAL = /^file:\/\/\/document\/downloads\/post-1\.\d+\.part$/;
const VIDEO = `${DIR}/post-1.mp4`;
const THUMBNAIL = `${DIR}/post-1.jpg`;
const THUMBNAIL_WAIT_MS = 10_000;

function start(thumbnail: string | null = 'https://pbs.test/thumb.jpg') {
  const onProgress = jest.fn<undefined, [number | null]>();
  const onComplete = jest.fn<undefined, [DownloadedFiles]>();
  const download = downloadVideo({
    postId: 'post-1',
    url: 'https://edge.test/720.mp4',
    headers: { [AUTHORIZATION]: 'Bearer t' },
    thumbnailUrl: thumbnail ?? undefined,
    onProgress,
    onComplete,
  });
  return { download, onProgress, onComplete, task: mockFileSystem.lastDownload() };
}

/** The .part files left on disk. */
const partFiles = (): string[] =>
  [...mockFileSystem.files.keys()].filter((uri) => uri.endsWith('.part'));

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  errorSpy.mockRestore();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('downloadVideo', () => {
  it('downloads into its own .part file, renames it to <postId>.mp4 and saves the thumbnail', async () => {
    const { download, onComplete, task } = start();
    expect(mockFileSystem.directories).toContain(DIR);
    expect(task.url).toBe('https://edge.test/720.mp4');
    expect(task.destination.uri).toMatch(PARTIAL);
    expect(task.headers).toEqual({ [AUTHORIZATION]: 'Bearer t' });
    expect(task.options.deferBackgroundSessionCompletion).toBe(true);

    task.finish(4321);
    await expect(download.done).resolves.toBeUndefined();

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({ sizeBytes: 4321, hasThumbnail: true });
    expect(partFiles()).toEqual([]);
    expect(mockFileSystem.files.get(VIDEO)).toBe('downloaded:https://edge.test/720.mp4');
    expect(mockFileSystem.fileDownloads).toEqual([
      { url: 'https://pbs.test/thumb.jpg', destination: THUMBNAIL, options: { idempotent: true } },
    ]);
    expect(task.acknowledged).toBe(1);
    expect(task.released).toBe(true);
  });

  it('gives every download its own .part file', () => {
    const first = start().task.destination.uri;
    const second = start().task.destination.uri;
    expect(first).toMatch(PARTIAL);
    expect(second).toMatch(PARTIAL);
    expect(second).not.toBe(first);
  });

  it('records the download after the rename and thumbnail, before the acknowledgment', async () => {
    const { download, onComplete, task } = start();
    const seen: unknown[] = [];
    onComplete.mockImplementation(() => {
      seen.push(
        task.acknowledged,
        mockFileSystem.files.has(VIDEO),
        mockFileSystem.files.has(THUMBNAIL),
      );
    });
    task.finish();
    await download.done;
    expect(seen).toEqual([0, true, true]);
    expect(task.acknowledged).toBe(1);
  });

  it('replaces an older video', async () => {
    mockFileSystem.files.set(VIDEO, 'old');
    const { download, task } = start();
    task.finish();
    await download.done;
    expect(mockFileSystem.files.get(VIDEO)).toBe('downloaded:https://edge.test/720.mp4');
  });

  it('without a thumbnail URL keeps no thumbnail', async () => {
    const { download, onComplete, task } = start(null);
    task.finish();
    await download.done;
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ hasThumbnail: false }));
    expect(mockFileSystem.fileDownloads).toEqual([]);
  });

  it('a failed thumbnail still completes the download', async () => {
    mockFileSystem.fileDownloadError = new Error('HTTP 404');
    const { download, onComplete, task } = start();
    task.finish();
    await download.done;
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ hasThumbnail: false }));
    expect(mockFileSystem.files.has(VIDEO)).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(
      '[Downloads] Thumbnail download failed',
      expect.any(Error),
    );
  });

  it('reports progress as a fraction, or null without a total size', () => {
    const { onProgress, task } = start();
    task.progress(25, 100);
    task.progress(10, -1);
    task.progress(10, 0);
    task.progress(150, 100);
    expect(onProgress.mock.calls).toEqual([[0.25], [null], [null], [1]]);
  });

  it('reports progress from BigInt byte counts (iOS)', () => {
    const { onProgress, task } = start();
    task.progress(25n, 100n);
    task.progress(10n, 0n);
    task.progress(300n, 100n);
    expect(onProgress.mock.calls).toEqual([[0.25], [null], [1]]);
  });

  it('cancels: rejects with DownloadCancelledError, keeps no file, records nothing', async () => {
    const { download, onComplete, task } = start();
    download.cancel();
    await expect(download.done).rejects.toBeInstanceOf(DownloadCancelledError);
    expect(task.state).toBe('cancelled');
    expect(task.released).toBe(true);
    expect(mockFileSystem.files.size).toBe(0);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('treats a transfer that ends paused as cancelled, without acknowledging it', async () => {
    const { download, onComplete, task } = start();
    task.pause();
    await expect(download.done).rejects.toThrow('Download cancelled');
    expect(mockFileSystem.files.has(VIDEO)).toBe(false);
    expect(task.acknowledged).toBe(0);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('cancelled after the transfer finished: deletes the .part file, still acknowledges', async () => {
    const { download, onComplete, task } = start();
    task.finish();
    download.cancel();
    await expect(download.done).rejects.toBeInstanceOf(DownloadCancelledError);
    expect(partFiles()).toEqual([]);
    expect(mockFileSystem.files.has(VIDEO)).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
    expect(task.acknowledged).toBe(1);
  });

  it('passes a transfer failure through, deletes the .part file and does not acknowledge', async () => {
    const { download, task } = start();
    mockFileSystem.files.set(task.destination.uri, 'half');
    task.fail(new Error('HTTP 403'));
    await expect(download.done).rejects.toThrow('HTTP 403');
    expect(partFiles()).toEqual([]);
    expect(task.released).toBe(true);
    expect(task.acknowledged).toBe(0);
  });

  it('a failing rename fails the download, and the transfer is still acknowledged', async () => {
    const { download, onComplete, task } = start();
    jest.spyOn(MockFile.prototype, 'moveSync').mockImplementation(() => {
      throw new Error('Disk full');
    });
    task.finish();
    await expect(download.done).rejects.toThrow('Disk full');
    expect(onComplete).not.toHaveBeenCalled();
    expect(task.acknowledged).toBe(1);
    expect(partFiles()).toEqual([]);
  });

  it('a throwing onComplete fails the download, and the transfer is still acknowledged', async () => {
    const { download, onComplete, task } = start();
    onComplete.mockImplementation(() => {
      throw new Error('Index failed');
    });
    task.finish();
    await expect(download.done).rejects.toThrow('Index failed');
    expect(task.acknowledged).toBe(1);
  });

  it('a failing acknowledgment is logged and does not fail the download', async () => {
    mockFileSystem.acknowledgeError = new Error('Session gone');
    const { download, onComplete, task } = start();
    task.finish();
    await expect(download.done).resolves.toBeUndefined();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      '[Downloads] Could not acknowledge the transfer',
      mockFileSystem.acknowledgeError,
    );
  });
});

describe('the thumbnail wait', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(MockFile, 'downloadFileAsync').mockReturnValue(new Promise(() => undefined));
  });

  it('gives up on a thumbnail that takes longer than 10 s and completes without it', async () => {
    const { download, onComplete, task } = start();
    task.finish(99);
    await jest.advanceTimersByTimeAsync(THUMBNAIL_WAIT_MS - 1);
    expect(onComplete).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    await expect(download.done).resolves.toBeUndefined();
    expect(onComplete).toHaveBeenCalledWith({ sizeBytes: 99, hasThumbnail: false });
    expect(task.acknowledged).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears the timer when the thumbnail arrives in time', async () => {
    jest.restoreAllMocks();
    const { download, onComplete, task } = start();
    task.finish();
    await jest.advanceTimersByTimeAsync(0);
    await download.done;
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ hasThumbnail: true }));
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('saveToPhotoLibrary', () => {
  it('asks for add-only, video-only access, then copies the file into the library', async () => {
    mockFileSystem.files.set(VIDEO, 'video');
    await expect(saveToPhotoLibrary(VIDEO)).resolves.toBe(true);
    expect(mockMediaLibrary.permissionRequests).toEqual([
      { writeOnly: true, granularPermissions: ['video'] },
    ]);
    expect(mockMediaLibrary.saved).toEqual([VIDEO]);
    expect(mockFileSystem.files.has(VIDEO)).toBe(true);
  });

  it('denied: saves nothing', async () => {
    mockMediaLibrary.granted = false;
    await expect(saveToPhotoLibrary(VIDEO)).resolves.toBe(false);
    expect(mockMediaLibrary.saved).toEqual([]);
  });

  it('passes a library failure through', async () => {
    mockFileSystem.files.set(VIDEO, 'video');
    mockMediaLibrary.saveError = new Error('Library full');
    await expect(saveToPhotoLibrary(VIDEO)).rejects.toThrow('Library full');
  });
});
