import { useCallback } from 'react';
import { Alert } from 'react-native';

import { SAVE_TO_PHOTOS_LABEL } from '@/components/downloads/SaveToPhotosStatus';
import { useSaveToPhotos, type SaveToPhotosState } from '@/hooks/use-save-to-photos';
import { deleteAllDownloads, deleteDownload } from '@/hooks/use-video-download';
import type { DownloadedVideo } from '@/utils/download-library';
import { downloadDetail, downloadsSummary } from '@/utils/downloads-summary';

export interface DownloadMenu {
  /** The latest "Save to Photos" from the menu. */
  readonly saveState: SaveToPhotosState;
  /** Opens the action menu for one download: save to the photo library, or delete it. */
  readonly open: (video: DownloadedVideo) => void;
}

/** A downloaded video's action menu (the platform's alert sheet). */
export function useDownloadMenu(): DownloadMenu {
  const { state, save } = useSaveToPhotos();
  const open = useCallback(
    (video: DownloadedVideo) => {
      Alert.alert(video.title, downloadDetail(video), [
        {
          text: SAVE_TO_PHOTOS_LABEL,
          onPress: () => {
            save(video);
          },
        },
        {
          text: 'Delete download',
          style: 'destructive',
          onPress: () => {
            deleteDownload(video.postId);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [save],
  );
  return { saveState: state, open };
}

/** Asks before deleting one download; `onDeleted` runs after it's gone. */
export function confirmDeleteDownload(video: DownloadedVideo, onDeleted: () => void): void {
  Alert.alert('Delete this download?', `${video.title} will be removed from this device.`, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: () => {
        deleteDownload(video.postId);
        onDeleted();
      },
    },
  ]);
}

/** Asks before deleting every download. */
export function confirmDeleteAllDownloads(videos: readonly DownloadedVideo[]): void {
  Alert.alert(
    'Delete all downloads?',
    `${downloadsSummary(videos)} will be removed from this device.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete all', style: 'destructive', onPress: deleteAllDownloads },
    ],
  );
}
