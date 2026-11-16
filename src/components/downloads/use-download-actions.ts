import { useCallback, useState } from 'react';

import { useDownloadOptions, type DownloadOptionsQuery } from '@/hooks/use-download-options';
import { useVideoDownload, type VideoDownload } from '@/hooks/use-video-download';
import { useGetVideoPost, useSession } from '@/shared';
import type { DownloadOption } from '@/utils/download-options';
import {
  downloadTargetOf,
  type DownloadablePost,
  type DownloadTarget,
} from '@/utils/download-target';

/** Which sheet is up: the actions menu, the quality list, or none. */
type OpenSheet = 'none' | 'menu' | 'quality';

export interface DownloadActions {
  /** The video the sheets act on (the page's post, or the last long-pressed list item). */
  readonly target: DownloadTarget | undefined;
  readonly download: VideoDownload;
  readonly options: DownloadOptionsQuery;
  readonly sheet: OpenSheet;
  /** Opens the actions menu for `post`; posts without a video are ignored. */
  readonly openMenu: (post?: DownloadablePost) => void;
  /** Opens the quality list (fetching the qualities). */
  readonly chooseQuality: () => void;
  readonly close: () => void;
  /** Closes the sheets and downloads `option`. */
  readonly select: (option: DownloadOption) => void;
}

/** Whether a list item gets the download menu (posts with a video). */
export function canDownload(post: DownloadablePost): boolean {
  return downloadTargetOf(post) !== undefined;
}

type PostQuery = ReturnType<typeof useGetVideoPost>;

/** The post to fetch for the target's attachment: only a feed item's, while qualities are shown. */
const postToLookUp = (target: DownloadTarget | undefined, enabled: boolean): string | undefined =>
  enabled && target?.attachmentId === undefined ? target?.postId : undefined;

/** The first video attachment of post `postId` (fetched only when an id is given). */
function usePostAttachment(postId: string | undefined) {
  const { token, tokenExpiration } = useSession();
  const post = useGetVideoPost(token ?? undefined, tokenExpiration ?? undefined, postId);
  const attachmentId =
    post.data === undefined ? undefined : downloadTargetOf(post.data)?.attachmentId;
  return { post, attachmentId };
}

/** While the post is fetched, or after it failed, the quality list shows that. */
function lookUpState(post: PostQuery): DownloadOptionsQuery {
  return {
    options: [],
    isLoading: !post.isError,
    isError: post.isError,
    refetch: () => void post.refetch(),
  };
}

/**
 * The qualities of the target's video attachment. A feed item's target has no attachment id, so
 * while the quality list is open its post is fetched for it first.
 */
function useTargetOptions(
  target: DownloadTarget | undefined,
  enabled: boolean,
): DownloadOptionsQuery {
  const { token } = useSession();
  const postId = postToLookUp(target, enabled);
  const { post, attachmentId } = usePostAttachment(postId);
  const options = useDownloadOptions(token, target?.attachmentId ?? attachmentId, {
    enabled,
    durationSeconds: target?.durationSeconds,
  });
  return postId === undefined || post.isSuccess ? options : lookUpState(post);
}

/**
 * The download sheets' state for one video: the actions menu, the quality list (qualities fetched
 * only while it is open) and the download itself. A video page passes its post's `target`; a list
 * leaves it out and opens the menu for whichever item was long-pressed.
 */
export function useDownloadActions(target?: DownloadTarget): DownloadActions {
  const { token } = useSession();
  const [sheet, setSheet] = useState<OpenSheet>('none');
  const [pressed, setPressed] = useState<DownloadTarget>();
  const active = target ?? pressed;
  const download = useVideoDownload(active, token);
  const options = useTargetOptions(active, sheet === 'quality');
  const { start } = download;
  const openMenu = useCallback((post?: DownloadablePost) => {
    const next = post === undefined ? undefined : downloadTargetOf(post);
    if (post !== undefined && next === undefined) {
      return;
    }
    if (next !== undefined) {
      setPressed(next);
    }
    setSheet('menu');
  }, []);
  const chooseQuality = useCallback(() => {
    setSheet('quality');
  }, []);
  const close = useCallback(() => {
    setSheet('none');
  }, []);
  const select = useCallback(
    (option: DownloadOption) => {
      setSheet('none');
      start(option);
    },
    [start],
  );
  return { target: active, download, options, sheet, openMenu, chooseQuality, close, select };
}
