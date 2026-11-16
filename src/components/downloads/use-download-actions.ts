import { useCallback, useState } from 'react';

import { useDownloadOptions, type DownloadOptionsQuery } from '@/hooks/use-download-options';
import { useVideoDownload, type VideoDownload } from '@/hooks/use-video-download';
import { useSession } from '@/shared';
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

/** Whether a list item gets the download menu (posts with a video attachment). */
export function canDownload(post: DownloadablePost): boolean {
  return downloadTargetOf(post) !== undefined;
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
  const options = useDownloadOptions(token, active?.attachmentId, {
    enabled: sheet === 'quality',
    durationSeconds: active?.durationSeconds,
  });
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
