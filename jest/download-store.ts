/**
 * Shared setup for the downloads store tests (src/hooks/use-video-download*.test.tsx): fixtures,
 * on-disk seeding, and helpers that drive a download through the store.
 */
import { act, renderHook, type RenderHookResult } from '@testing-library/react-native';

import {
  useStopDownloadsOnSignOut,
  useVideoDownload,
  type VideoDownload,
} from '@/hooks/use-video-download';
import type { DownloadedVideo } from '@/utils/download-library';
import type { DownloadOption } from '@/utils/download-options';
import type { DownloadTarget } from '@/utils/download-target';
import { mockFileSystem } from '@test/mocks/expo-file-system';

export const DOWNLOADS_DIR = 'file:///document/downloads';
const INDEX = `${DOWNLOADS_DIR}/index.json`;
export const DOWNLOAD_NOW = '2026-11-15T10:00:00.000Z';

export const OPTION_720: DownloadOption = {
  id: '720-avc1',
  label: '720p',
  url: 'https://edge.test/720.mp4',
  sizeBytes: 1000,
  estimated: false,
};
export const OPTION_1080: DownloadOption = {
  ...OPTION_720,
  label: '1080p',
  url: 'https://edge.test/1080.mp4',
};

export const downloadTarget = (postId = 'post-1'): DownloadTarget => ({
  postId,
  title: 'Home Lab Tour',
  channel: 'LTT',
  thumbnailUrl: 'https://pbs.test/thumb.jpg',
  durationSeconds: 600,
  attachmentId: 'att-1',
});

export const indexOnDisk = (): DownloadedVideo[] =>
  JSON.parse(mockFileSystem.files.get(INDEX) ?? '[]') as DownloadedVideo[];

/** Puts a finished download on disk, as an earlier app run left it. */
export function seedDownload(postId: string, downloadedAt = DOWNLOAD_NOW): DownloadedVideo {
  const video: DownloadedVideo = {
    postId,
    title: `Video ${postId}`,
    label: '1080p',
    sizeBytes: 500,
    downloadedAt,
    hasThumbnail: false,
  };
  mockFileSystem.files.set(`${DOWNLOADS_DIR}/${postId}.mp4`, 'video');
  mockFileSystem.files.set(INDEX, JSON.stringify([...indexOnDisk(), video]));
  return video;
}

/**
 * Fake clock at DOWNLOAD_NOW and a silenced console.error (returned for assertions); after each
 * test, signs out so the app-wide store forgets its memory and the next test reads its own disk.
 */
export function setUpDownloadStoreTests(): { errorSpy: () => jest.SpyInstance } {
  let errorSpy: jest.SpyInstance | undefined;
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(DOWNLOAD_NOW), doNotFake: ['nextTick', 'setImmediate'] });
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(async () => {
    await renderHook(() => {
      useStopDownloadsOnSignOut(false);
    });
    errorSpy?.mockRestore();
    jest.useRealTimers();
  });
  return {
    errorSpy: () => {
      if (errorSpy === undefined) {
        throw new Error('errorSpy is only set inside a test');
      }
      return errorSpy;
    },
  };
}

type DownloadHook = RenderHookResult<VideoDownload, unknown>;

export async function renderDownload(
  postTarget: DownloadTarget | null = downloadTarget(),
  token = 'token',
): Promise<DownloadHook> {
  return renderHook(() => useVideoDownload(postTarget ?? undefined, token));
}

/** Let promise callbacks (transfer → rename → thumbnail → store) run. */
export const settle = (): Promise<void> =>
  act(async () => {
    for (let step = 0; step < 5; step += 1) {
      await Promise.resolve();
    }
  });

export async function startDownload(
  postTarget = downloadTarget(),
  option = OPTION_720,
): Promise<DownloadHook> {
  const hook = await renderDownload(postTarget);
  await act(() => {
    hook.result.current.start(option);
  });
  return hook;
}

export async function finishDownload(sizeBytes = 4321): Promise<void> {
  await act(() => {
    mockFileSystem.lastDownload().finish(sizeBytes);
  });
  await settle();
}
