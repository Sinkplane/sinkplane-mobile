import { File, type DownloadTask } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';

import {
  deleteIfPresent,
  partialFileFor,
  thumbnailFileFor,
  videoFileFor,
} from '@/utils/download-library';
import { logError } from '@/utils/log';

/** Progress of the transfer: 0–1, or null while the server sent no Content-Length. */
type DownloadProgressListener = (fraction: number | null) => void;

export interface VideoDownloadRequest {
  readonly postId: string;
  readonly url: string;
  readonly headers: Record<string, string>;
  /** Saved next to the video for the offline Downloads list; failures are ignored. */
  readonly thumbnailUrl?: string | undefined;
  readonly onProgress: DownloadProgressListener;
}

export interface DownloadedFiles {
  readonly sizeBytes: number;
  readonly hasThumbnail: boolean;
}

/** A running download; `done` rejects with a `DownloadCancelledError` after `cancel()`. */
export interface RunningDownload {
  readonly done: Promise<DownloadedFiles>;
  readonly cancel: () => void;
}

export class DownloadCancelledError extends Error {
  constructor() {
    super('Download cancelled');
    this.name = 'DownloadCancelledError';
  }
}

function fraction({ bytesWritten, totalBytes }: { bytesWritten: number; totalBytes: number }) {
  return totalBytes > 0 ? Math.min(bytesWritten / totalBytes, 1) : null;
}

async function downloadThumbnail(postId: string, url: string | undefined): Promise<boolean> {
  if (url === undefined) {
    return false;
  }
  try {
    await File.downloadFileAsync(url, thumbnailFileFor(postId), { idempotent: true });
    return true;
  } catch (error) {
    logError('[Downloads] Thumbnail download failed', error);
    return false;
  }
}

async function transfer(
  task: DownloadTask,
  request: VideoDownloadRequest,
  isCancelled: () => boolean,
): Promise<DownloadedFiles> {
  const partial = await task.downloadAsync();
  if (partial === null || isCancelled()) {
    throw new DownloadCancelledError();
  }
  const video = videoFileFor(request.postId);
  partial.moveSync(video, { overwrite: true });
  const hasThumbnail = await downloadThumbnail(request.postId, request.thumbnailUrl);
  return { sizeBytes: video.size, hasThumbnail };
}

/**
 * Downloads a post's video into the app's downloads directory (see download-library). The
 * transfer writes a `.part` file that is renamed once complete and removed on failure or cancel.
 * On iOS it uses a background session, so it continues while the app is suspended (not after it
 * is terminated).
 */
export function downloadVideo(request: VideoDownloadRequest): RunningDownload {
  const partial = partialFileFor(request.postId);
  deleteIfPresent(partial);
  let cancelled = false;
  const task = File.createDownloadTask(request.url, partial, {
    headers: request.headers,
    onProgress: (progress) => {
      request.onProgress(fraction(progress));
    },
  });
  const done = transfer(task, request, () => cancelled)
    .catch((error: unknown) => {
      deleteIfPresent(partial);
      throw cancelled ? new DownloadCancelledError() : error;
    })
    .finally(() => {
      task.release();
    });
  return {
    done,
    cancel: () => {
      cancelled = true;
      task.cancel();
    },
  };
}

/**
 * Copies a downloaded video into the photo library (iOS Photos / the Android gallery's Movies
 * folder). Asks for add-only access first (iOS `addOnly`; Android 10+ adds media without a prompt,
 * older versions ask for storage); resolves false when it's denied.
 */
export async function saveToPhotoLibrary(fileUri: string): Promise<boolean> {
  const { granted } = await requestPermissionsAsync(true, ['video']);
  if (!granted) {
    return false;
  }
  await Asset.create(fileUri);
  return true;
}
