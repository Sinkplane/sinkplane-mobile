import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { downloads, IDLE, type VideoDownloadState } from '@/hooks/video-downloads';
import type { DownloadedVideo } from '@/utils/download-library';
import type { DownloadOption } from '@/utils/download-options';
import type { DownloadTarget } from '@/utils/download-target';

export type { VideoDownloadState } from '@/hooks/video-downloads';

/** Signing out (or never having signed in) stops every transfer; downloaded videos are kept. */
export function useStopDownloadsOnSignOut(signedIn: boolean): void {
  useEffect(() => {
    if (!signedIn) {
      downloads.reset();
    }
  }, [signedIn]);
}

export interface VideoDownload {
  readonly state: VideoDownloadState;
  readonly start: (option: DownloadOption) => void;
  readonly cancel: () => void;
  readonly dismiss: () => void;
  readonly remove: () => void;
}

/** A post's download state plus the actions on it; the download outlives the component. */
export function useVideoDownload(
  target: DownloadTarget | undefined,
  token: string | null | undefined,
): VideoDownload {
  const postId = target?.postId;
  const state = useSyncExternalStore(downloads.subscribe, () =>
    postId === undefined ? IDLE : downloads.get(postId),
  );
  const start = useCallback(
    (option: DownloadOption) => {
      if (target !== undefined) {
        downloads.start({ target, token, option });
      }
    },
    [target, token],
  );
  const cancel = useCallback(() => {
    if (postId !== undefined) {
      downloads.cancel(postId);
    }
  }, [postId]);
  const dismiss = useCallback(() => {
    if (postId !== undefined) {
      downloads.dismiss(postId);
    }
  }, [postId]);
  const remove = useCallback(() => {
    if (postId !== undefined) {
      downloads.remove(postId);
    }
  }, [postId]);
  return { state, start, cancel, dismiss, remove };
}

/** Every downloaded video, newest first. */
export function useDownloadedVideos(): readonly DownloadedVideo[] {
  return useSyncExternalStore(downloads.subscribe, downloads.list);
}

/** A post's downloaded video, if it has one. */
export function useDownloadedVideo(postId: string): DownloadedVideo | undefined {
  const state = useSyncExternalStore(downloads.subscribe, () => downloads.get(postId));
  return state.status === 'downloaded' ? state.video : undefined;
}

export function deleteDownload(postId: string): void {
  downloads.remove(postId);
}

export function deleteAllDownloads(): void {
  downloads.removeAll();
}
