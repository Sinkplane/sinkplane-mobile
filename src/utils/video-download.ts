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
  /**
   * The video (and thumbnail) are in place: record them. Runs before the transfer is acknowledged,
   * so iOS keeps a backgrounded app running until the download is recorded.
   */
  readonly onComplete: (files: DownloadedFiles) => void;
}

export interface DownloadedFiles {
  readonly sizeBytes: number;
  readonly hasThumbnail: boolean;
}

/**
 * A running download; `done` settles once `onComplete` ran and the transfer was acknowledged, and
 * rejects with a `DownloadCancelledError` after `cancel()`.
 */
export interface RunningDownload {
  readonly done: Promise<void>;
  readonly cancel: () => void;
}

export class DownloadCancelledError extends Error {
  constructor() {
    super('Download cancelled');
    this.name = 'DownloadCancelledError';
  }
}

/** 0–1, or null without a total size. iOS reports the byte counts as BigInt, so they're converted. */
function fraction(progress: { bytesWritten: number | bigint; totalBytes: number | bigint }) {
  const total = Number(progress.totalBytes);
  return total > 0 ? Math.min(Number(progress.bytesWritten) / total, 1) : null;
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

/**
 * How long a finished download waits for its thumbnail: iOS gives a backgrounded app about 25 s to
 * handle the completion, and the download must be recorded within it.
 */
const THUMBNAIL_WAIT_MS = 10_000;

/** The thumbnail's outcome, or false (no thumbnail) when it takes longer than THUMBNAIL_WAIT_MS. */
function withinThumbnailWait(thumbnail: Promise<boolean>): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => {
      resolve(false);
    }, THUMBNAIL_WAIT_MS);
  });
  return Promise.race([thumbnail, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

/** Tells iOS the background transfer's completion was handled (a no-op on Android). */
async function acknowledge(task: DownloadTask): Promise<void> {
  try {
    await task.acknowledgeBackgroundCompletionAsync();
  } catch (error) {
    logError('[Downloads] Could not acknowledge the transfer', error);
  }
}

async function transfer(
  task: DownloadTask,
  request: VideoDownloadRequest,
  isCancelled: () => boolean,
): Promise<void> {
  const partial = await task.downloadAsync();
  if (partial === null) {
    throw new DownloadCancelledError();
  }
  try {
    if (isCancelled()) {
      throw new DownloadCancelledError();
    }
    const video = videoFileFor(request.postId);
    partial.moveSync(video, { overwrite: true });
    const hasThumbnail = await withinThumbnailWait(
      downloadThumbnail(request.postId, request.thumbnailUrl),
    );
    request.onComplete({ sizeBytes: video.size, hasThumbnail });
  } finally {
    // Every successful background download needs its acknowledgment, cancelled or not.
    await acknowledge(task);
  }
}

let transfers = 0;

/**
 * Downloads a post's video into the app's downloads directory (see download-library). The
 * transfer writes its own `.part` file, renamed once complete and removed on failure or cancel.
 * On iOS it uses a background session, so it continues while the app is suspended (not after it
 * is terminated); completion is deferred until `onComplete` recorded the download.
 */
export function downloadVideo(request: VideoDownloadRequest): RunningDownload {
  transfers += 1;
  const partial = partialFileFor(request.postId, String(transfers));
  let cancelled = false;
  const task = File.createDownloadTask(request.url, partial, {
    headers: request.headers,
    deferBackgroundSessionCompletion: true,
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
