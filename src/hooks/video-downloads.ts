/**
 * The app-wide downloads store behind `use-video-download`: running transfers plus the downloaded
 * videos on disk.
 */
import {
  deleteDownloadFiles,
  deleteIfPresent,
  readLibrary,
  thumbnailFileFor,
  videoFileFor,
  writeLibrary,
  type DownloadedVideo,
} from '@/utils/download-library';
import type { DownloadOption } from '@/utils/download-options';
import type { DownloadTarget } from '@/utils/download-target';
import { logError } from '@/utils/log';
import { requestHeaders } from '@/utils/stream-source';
import {
  DownloadCancelledError,
  downloadVideo,
  type DownloadedFiles,
  type RunningDownload,
} from '@/utils/video-download';

/** One post's download. */
export type VideoDownloadState =
  | { readonly status: 'idle' }
  /** `progress` is 0–1, or null before the transfer reports a size. */
  | { readonly status: 'downloading'; readonly label: string; readonly progress: number | null }
  | { readonly status: 'downloaded'; readonly video: DownloadedVideo }
  | { readonly status: 'failed'; readonly label: string };

interface StartDownload {
  readonly target: DownloadTarget;
  readonly token: string | null | undefined;
  readonly option: DownloadOption;
}

export const IDLE: VideoDownloadState = { status: 'idle' };
const PERCENT = 100;
const NO_VIDEOS: readonly DownloadedVideo[] = [];

/** Same percent → same state object, so progress events don't re-render for sub-percent steps. */
const samePercent = (a: number | null, b: number | null): boolean =>
  a === b || (a !== null && b !== null && Math.floor(a * PERCENT) === Math.floor(b * PERCENT));

const newestFirst = (a: DownloadedVideo, b: DownloadedVideo): number =>
  b.downloadedAt.localeCompare(a.downloadedAt);

function downloadedVideo(request: StartDownload, files: DownloadedFiles): DownloadedVideo {
  const { target, option } = request;
  return {
    postId: target.postId,
    title: target.title,
    ...(target.channel === undefined ? {} : { channel: target.channel }),
    label: option.label,
    sizeBytes: files.sizeBytes,
    ...(target.durationSeconds === undefined ? {} : { durationSeconds: target.durationSeconds }),
    downloadedAt: new Date().toISOString(),
    hasThumbnail: files.hasThumbnail,
  };
}

/** One start of a post's download; a cancelled or replaced attempt may no longer write state. */
class Attempt {
  private download: RunningDownload | undefined;

  constructor(readonly request: StartDownload) {}

  get postId(): string {
    return this.request.target.postId;
  }

  run(download: RunningDownload): Promise<DownloadedFiles> {
    this.download = download;
    return download.done;
  }

  cancel(): void {
    this.download?.cancel();
  }
}

/**
 * App-wide downloads by post id: running transfers plus the downloaded videos on disk (read
 * lazily from the downloads index). Module-level, not page state, so a download keeps going after
 * its page closes and every screen sees the same list.
 */
class VideoDownloads {
  private states: Map<string, VideoDownloadState> | undefined;
  private videos: readonly DownloadedVideo[] = NO_VIDEOS;
  private readonly attempts = new Map<string, Attempt>();
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly list = (): readonly DownloadedVideo[] => {
    this.load();
    return this.videos;
  };

  get(postId: string): VideoDownloadState {
    return this.load().get(postId) ?? IDLE;
  }

  /** Starts a download unless the post is already downloading or downloaded. */
  start(request: StartDownload): void {
    const { target, option } = request;
    const status = this.get(target.postId).status;
    if (status === 'downloading' || status === 'downloaded') {
      return;
    }
    const attempt = new Attempt(request);
    this.attempts.set(target.postId, attempt);
    this.set(target.postId, { status: 'downloading', label: option.label, progress: null });
    void this.run(attempt);
  }

  cancel(postId: string): void {
    if (this.get(postId).status !== 'downloading') {
      return;
    }
    this.attempts.get(postId)?.cancel();
    this.attempts.delete(postId);
    this.set(postId, IDLE);
  }

  /** Back to idle after a failed download. */
  dismiss(postId: string): void {
    if (this.get(postId).status === 'failed') {
      this.set(postId, IDLE);
    }
  }

  /** Deletes a downloaded video's files. */
  remove(postId: string): void {
    if (this.get(postId).status !== 'downloaded') {
      return;
    }
    deleteDownloadFiles(postId);
    this.set(postId, IDLE);
    this.persist();
  }

  removeAll(): void {
    for (const video of this.list()) {
      deleteDownloadFiles(video.postId);
      this.load().delete(video.postId);
    }
    this.persist();
    this.notify();
  }

  /**
   * Signing out stops every transfer and drops what's in memory; the downloaded videos stay on
   * disk (an offline launch signs out too) and are read again on next use.
   */
  reset(): void {
    for (const attempt of this.attempts.values()) {
      attempt.cancel();
    }
    this.attempts.clear();
    this.states = undefined;
    this.videos = NO_VIDEOS;
    this.notify();
  }

  private load(): Map<string, VideoDownloadState> {
    if (this.states === undefined) {
      const videos = readLibrary();
      this.states = new Map(videos.map((video) => [video.postId, downloadedState(video)]));
      this.videos = [...videos].sort(newestFirst);
    }
    return this.states;
  }

  private async run(attempt: Attempt): Promise<void> {
    try {
      const files = await attempt.run(this.begin(attempt));
      this.complete(attempt, files);
    } catch (error) {
      this.fail(attempt, error);
    }
  }

  private begin(attempt: Attempt): RunningDownload {
    const { target, token, option } = attempt.request;
    return downloadVideo({
      postId: target.postId,
      url: option.url,
      headers: requestHeaders(token),
      thumbnailUrl: target.thumbnailUrl,
      onProgress: (progress) => {
        this.progress(attempt, progress);
      },
    });
  }

  private complete(attempt: Attempt, files: DownloadedFiles): void {
    if (!this.isCurrent(attempt)) {
      // Cancelled while the thumbnail was saved: drop the finished files.
      deleteIfPresent(videoFileFor(attempt.postId));
      deleteIfPresent(thumbnailFileFor(attempt.postId));
      return;
    }
    this.attempts.delete(attempt.postId);
    this.set(attempt.postId, downloadedState(downloadedVideo(attempt.request, files)));
    this.persist();
  }

  private progress(attempt: Attempt, progress: number | null): void {
    const current = this.get(attempt.postId);
    if (
      this.isCurrent(attempt) &&
      current.status === 'downloading' &&
      !samePercent(current.progress, progress)
    ) {
      this.set(attempt.postId, { status: 'downloading', label: current.label, progress });
    }
  }

  private fail(attempt: Attempt, error: unknown): void {
    if (error instanceof DownloadCancelledError || !this.isCurrent(attempt)) {
      return;
    }
    logError('[Downloads] Download failed', error);
    this.attempts.delete(attempt.postId);
    this.set(attempt.postId, { status: 'failed', label: attempt.request.option.label });
  }

  private isCurrent(attempt: Attempt): boolean {
    return this.attempts.get(attempt.postId) === attempt;
  }

  private set(postId: string, state: VideoDownloadState): void {
    const states = this.load();
    if (state.status === 'idle') {
      states.delete(postId);
    } else {
      states.set(postId, state);
    }
    this.notify();
  }

  /** Rewrites the index and the list snapshot from the downloaded states. */
  private persist(): void {
    const videos: DownloadedVideo[] = [];
    for (const state of this.load().values()) {
      if (state.status === 'downloaded') {
        videos.push(state.video);
      }
    }
    this.videos = [...videos].sort(newestFirst);
    writeLibrary(this.videos);
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function downloadedState(video: DownloadedVideo): VideoDownloadState {
  return { status: 'downloaded', video };
}

/** The app's one downloads store (see the hooks in use-video-download). */
export const downloads = new VideoDownloads();
