import type { DownloadedVideo } from '@/utils/download-library';
import { formatBytes } from '@/utils/download-options';

/** Bytes the downloaded videos take on the device. */
export function totalDownloadBytes(videos: readonly DownloadedVideo[]): number {
  return videos.reduce((sum, video) => sum + video.sizeBytes, 0);
}

/** `3 videos · 2.4 GB`, `1 video · 220 MB`, or `None yet`. */
export function downloadsSummary(videos: readonly DownloadedVideo[]): string {
  if (videos.length === 0) {
    return 'None yet';
  }
  const count = videos.length === 1 ? '1 video' : `${String(videos.length)} videos`;
  return `${count} · ${formatBytes(totalDownloadBytes(videos))}`;
}

/** `1080p · 1.2 GB`: the quality that was downloaded and its size. */
export function downloadDetail(video: DownloadedVideo): string {
  return `${video.label} · ${formatBytes(video.sizeBytes)}`;
}
