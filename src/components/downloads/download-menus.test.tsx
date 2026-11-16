import { Alert } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';

import {
  confirmDeleteAllDownloads,
  confirmDeleteDownload,
  useDownloadMenu,
} from '@/components/downloads/download-menus';
import { useDownloadedVideos, useStopDownloadsOnSignOut } from '@/hooks/use-video-download';
import { alertLabels, lastAlert, pressAlertButton, spyOnAlert } from '@test/alert';
import { DOWNLOADED_VIDEOS, downloadUri, seedDownloads } from '@test/fixtures-downloads';
import { mockFileSystem } from '@test/mocks/expo-file-system';
import { mockMediaLibrary } from '@test/mocks/expo-media-library';

const [NEWER, OLDER] = DOWNLOADED_VIDEOS as [
  (typeof DOWNLOADED_VIDEOS)[0],
  (typeof DOWNLOADED_VIDEOS)[0],
];

let alert: ReturnType<typeof spyOnAlert>;

beforeEach(() => {
  seedDownloads(mockFileSystem);
  alert = spyOnAlert(Alert);
});

afterEach(async () => {
  // The downloads store is app-wide: drop what it read for the next test.
  await renderHook(() => {
    useStopDownloadsOnSignOut(false);
  });
});

const postIds = (videos: readonly { postId: string }[]) => videos.map((video) => video.postId);

async function renderMenu() {
  return renderHook(() => ({ menu: useDownloadMenu(), videos: useDownloadedVideos() }));
}

describe('useDownloadMenu', () => {
  it('offers Save to Photos, Delete and Cancel for the download', async () => {
    const { result } = await renderMenu();
    result.current.menu.open(OLDER);
    expect(lastAlert(alert)).toMatchObject({ title: 'Home Lab Tour', message: '1080p · 1.2 GB' });
    expect(alertLabels(alert)).toEqual(['Save to Photos', 'Delete download', 'Cancel']);
    expect(lastAlert(alert).buttons.map((button) => button.style)).toEqual([
      undefined,
      'destructive',
      'cancel',
    ]);
    expect(result.current.menu.saveState).toBe('idle');
  });

  it('Save to Photos copies the video file into the library', async () => {
    const { result } = await renderMenu();
    result.current.menu.open(OLDER);
    await act(async () => {
      pressAlertButton(alert, 'Save to Photos');
      await Promise.resolve();
    });
    expect(mockMediaLibrary.saved).toEqual([downloadUri('post-1')]);
    expect(result.current.menu.saveState).toBe('saved');
  });

  it('Delete download removes it from the list and the device', async () => {
    const { result } = await renderMenu();
    expect(postIds(result.current.videos)).toEqual(['post-2', 'post-1']);
    result.current.menu.open(NEWER);
    await act(() => {
      pressAlertButton(alert, 'Delete download');
    });
    expect(postIds(result.current.videos)).toEqual(['post-1']);
    expect(mockFileSystem.files.has(downloadUri('post-2'))).toBe(false);
    expect(mockFileSystem.files.has(downloadUri('post-1'))).toBe(true);
  });
});

describe('confirmDeleteDownload', () => {
  it('asks first; Cancel keeps it', async () => {
    const { result } = await renderMenu();
    const onDeleted = jest.fn();
    confirmDeleteDownload(OLDER, onDeleted);
    expect(lastAlert(alert)).toMatchObject({
      title: 'Delete this download?',
      message: 'Home Lab Tour will be removed from this device.',
    });
    expect(alertLabels(alert)).toEqual(['Cancel', 'Delete']);
    await act(() => {
      pressAlertButton(alert, 'Cancel');
    });
    expect(postIds(result.current.videos)).toEqual(['post-2', 'post-1']);
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('Delete removes it, then reports back', async () => {
    const { result } = await renderMenu();
    const onDeleted = jest.fn();
    confirmDeleteDownload(OLDER, onDeleted);
    expect(lastAlert(alert).buttons[1]?.style).toBe('destructive');
    await act(() => {
      pressAlertButton(alert, 'Delete');
    });
    expect(postIds(result.current.videos)).toEqual(['post-2']);
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });
});

describe('confirmDeleteAllDownloads', () => {
  it('names what goes, and deletes everything on confirm', async () => {
    const { result } = await renderMenu();
    confirmDeleteAllDownloads(result.current.videos);
    expect(lastAlert(alert)).toMatchObject({
      title: 'Delete all downloads?',
      message: '2 videos · 1.4 GB will be removed from this device.',
    });
    expect(alertLabels(alert)).toEqual(['Cancel', 'Delete all']);
    expect(lastAlert(alert).buttons[1]?.style).toBe('destructive');
    await act(() => {
      pressAlertButton(alert, 'Delete all');
    });
    expect(result.current.videos).toEqual([]);
    expect(mockFileSystem.files.has(downloadUri('post-1'))).toBe(false);
  });
});
