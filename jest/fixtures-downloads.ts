/**
 * Downloaded videos for the Downloads screens, and a helper writing them into the in-memory file
 * system the way the app stores them (`file:///document/downloads/`: index.json, `<postId>.mp4`,
 * `<postId>.jpg`).
 */
import type { DownloadedVideo } from '@/utils/download-library';

import type { mockFileSystem as MockFileSystem } from './mocks/expo-file-system';

const DOWNLOADS_DIR = 'file:///document/downloads';

export const downloadUri = (postId: string, extension = 'mp4'): string =>
  `${DOWNLOADS_DIR}/${postId}.${extension}`;

export function makeDownloadedVideo(overrides: Partial<DownloadedVideo> = {}): DownloadedVideo {
  return {
    postId: 'post-1',
    title: 'Home Lab Tour',
    channel: 'Tech Channel',
    label: '1080p',
    sizeBytes: 1_288_490_189,
    durationSeconds: 600,
    downloadedAt: '2026-11-10T12:00:00.000Z',
    hasThumbnail: true,
    ...overrides,
  };
}

/** Two downloads: a newer 720p without a channel or thumbnail, and an older 1080p. */
export const DOWNLOADED_VIDEOS: readonly DownloadedVideo[] = [
  {
    postId: 'post-2',
    title: 'Server Rack Build',
    label: '720p',
    sizeBytes: 230_686_720,
    downloadedAt: '2026-11-12T08:30:00.000Z',
    hasThumbnail: false,
  },
  makeDownloadedVideo(),
];

/** Writes `videos` (their files and the index) into the mock file system. */
export function seedDownloads(
  fileSystem: typeof MockFileSystem,
  videos: readonly DownloadedVideo[] = DOWNLOADED_VIDEOS,
): void {
  fileSystem.directories.add(DOWNLOADS_DIR);
  fileSystem.files.set(`${DOWNLOADS_DIR}/index.json`, JSON.stringify(videos));
  for (const video of videos) {
    fileSystem.files.set(downloadUri(video.postId), `video:${video.postId}`);
    fileSystem.sizes.set(downloadUri(video.postId), video.sizeBytes);
    if (video.hasThumbnail) {
      fileSystem.files.set(downloadUri(video.postId, 'jpg'), `thumbnail:${video.postId}`);
    }
  }
}
