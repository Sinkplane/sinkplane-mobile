import { useCallback, useState } from 'react';

import { downloadedVideoUri, type DownloadedVideo } from '@/utils/download-library';
import { logError } from '@/utils/log';
import { saveToPhotoLibrary } from '@/utils/video-download';

export type SaveToPhotosState = 'idle' | 'saving' | 'saved' | 'denied' | 'failed';

export interface SaveToPhotos {
  readonly state: SaveToPhotosState;
  readonly save: (video: DownloadedVideo) => void;
}

/** Copies a downloaded video into the photo library; the app keeps its own copy. */
export function useSaveToPhotos(): SaveToPhotos {
  const [state, setState] = useState<SaveToPhotosState>('idle');
  const save = useCallback((video: DownloadedVideo) => {
    setState('saving');
    saveToPhotoLibrary(downloadedVideoUri(video)).then(
      (saved) => {
        setState(saved ? 'saved' : 'denied');
      },
      (error: unknown) => {
        logError('[Downloads] Save to Photos failed', error);
        setState('failed');
      },
    );
  }, []);
  return { state, save };
}
