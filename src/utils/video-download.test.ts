import { mockFileSystem } from '@test/mocks/expo-file-system';
import { mockMediaLibrary } from '@test/mocks/expo-media-library';
import { DownloadCancelledError, downloadVideo, saveToPhotoLibrary } from '@/utils/video-download';

const AUTHORIZATION = 'Authorization';
const DIR = 'file:///document/downloads';
const PARTIAL = `${DIR}/post-1.mp4.part`;
const VIDEO = `${DIR}/post-1.mp4`;
const THUMBNAIL = `${DIR}/post-1.jpg`;

function start(thumbnail: string | null = 'https://pbs.test/thumb.jpg') {
  const onProgress = jest.fn<undefined, [number | null]>();
  const download = downloadVideo({
    postId: 'post-1',
    url: 'https://edge.test/720.mp4',
    headers: { [AUTHORIZATION]: 'Bearer t' },
    thumbnailUrl: thumbnail ?? undefined,
    onProgress,
  });
  return { download, onProgress, task: mockFileSystem.lastDownload() };
}

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('downloadVideo', () => {
  it('downloads into a .part file, renames it to <postId>.mp4 and saves the thumbnail', async () => {
    const { download, task } = start();
    expect(mockFileSystem.directories).toContain(DIR);
    expect(task.url).toBe('https://edge.test/720.mp4');
    expect(task.destination.uri).toBe(PARTIAL);
    expect(task.headers).toEqual({ [AUTHORIZATION]: 'Bearer t' });

    task.finish(4321);
    await expect(download.done).resolves.toEqual({ sizeBytes: 4321, hasThumbnail: true });

    expect(mockFileSystem.files.has(PARTIAL)).toBe(false);
    expect(mockFileSystem.files.get(VIDEO)).toBe('downloaded:https://edge.test/720.mp4');
    expect(mockFileSystem.fileDownloads).toEqual([
      { url: 'https://pbs.test/thumb.jpg', destination: THUMBNAIL, options: { idempotent: true } },
    ]);
    expect(task.released).toBe(true);
  });

  it('replaces a leftover .part file and an older video', async () => {
    mockFileSystem.files.set(PARTIAL, 'stale');
    mockFileSystem.files.set(VIDEO, 'old');
    const { download, task } = start();
    expect(mockFileSystem.files.has(PARTIAL)).toBe(false);
    task.finish();
    await download.done;
    expect(mockFileSystem.files.get(VIDEO)).toBe('downloaded:https://edge.test/720.mp4');
  });

  it('without a thumbnail URL keeps no thumbnail', async () => {
    const { download, task } = start(null);
    task.finish();
    await expect(download.done).resolves.toMatchObject({ hasThumbnail: false });
    expect(mockFileSystem.fileDownloads).toEqual([]);
  });

  it('a failed thumbnail still completes the download', async () => {
    mockFileSystem.fileDownloadError = new Error('HTTP 404');
    const { download, task } = start();
    task.finish();
    await expect(download.done).resolves.toMatchObject({ hasThumbnail: false });
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

  it('cancels: rejects with DownloadCancelledError and keeps no file', async () => {
    const { download, task } = start();
    download.cancel();
    await expect(download.done).rejects.toBeInstanceOf(DownloadCancelledError);
    expect(task.state).toBe('cancelled');
    expect(task.released).toBe(true);
    expect(mockFileSystem.files.size).toBe(0);
  });

  it('treats a transfer that ends paused as cancelled', async () => {
    const { download, task } = start();
    task.pause();
    await expect(download.done).rejects.toThrow('Download cancelled');
    expect(mockFileSystem.files.has(VIDEO)).toBe(false);
  });

  it('cancelled after the transfer finished: deletes the .part file, keeps no video', async () => {
    const { download, task } = start();
    task.finish();
    download.cancel();
    await expect(download.done).rejects.toBeInstanceOf(DownloadCancelledError);
    expect(mockFileSystem.files.has(PARTIAL)).toBe(false);
    expect(mockFileSystem.files.has(VIDEO)).toBe(false);
  });

  it('passes a transfer failure through and deletes the .part file', async () => {
    const { download, task } = start();
    mockFileSystem.files.set(PARTIAL, 'half');
    task.fail(new Error('HTTP 403'));
    await expect(download.done).rejects.toThrow('HTTP 403');
    expect(mockFileSystem.files.has(PARTIAL)).toBe(false);
    expect(task.released).toBe(true);
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
