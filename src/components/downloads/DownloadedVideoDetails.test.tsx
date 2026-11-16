import { Alert } from 'react-native';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';

import { DownloadedVideoDetails } from '@/components/downloads/DownloadedVideoDetails';
import { useStopDownloadsOnSignOut } from '@/hooks/use-video-download';
import { lastAlert, pressAlertButton, spyOnAlert } from '@test/alert';
import { DOWNLOADED_VIDEOS, downloadUri, seedDownloads } from '@test/fixtures-downloads';
import { mockFileSystem } from '@test/mocks/expo-file-system';
import { mockMediaLibrary } from '@test/mocks/expo-media-library';

const [NO_CHANNEL, WITH_CHANNEL] = DOWNLOADED_VIDEOS as [
  (typeof DOWNLOADED_VIDEOS)[0],
  (typeof DOWNLOADED_VIDEOS)[0],
];

let alert: ReturnType<typeof spyOnAlert>;

beforeEach(() => {
  seedDownloads(mockFileSystem);
  alert = spyOnAlert(Alert);
});

afterEach(async () => {
  await renderHook(() => {
    useStopDownloadsOnSignOut(false);
  });
});

async function renderDetails(video = WITH_CHANNEL) {
  const onDeleted = jest.fn();
  await render(<DownloadedVideoDetails video={video} onDeleted={onDeleted} />);
  return { onDeleted };
}

const saveButton = () => screen.getByRole('button', { name: 'Save to Photos' });

describe('DownloadedVideoDetails', () => {
  it('describes the download', async () => {
    await renderDetails();
    expect(screen.getByTestId('downloaded-video-details')).toHaveTextContent(
      'Home Lab TourTech ChannelDownloaded · 1080p · 1.2 GBSave to PhotosDelete download',
      { exact: true },
    );
  });

  it('leaves out a missing channel', async () => {
    await renderDetails(NO_CHANNEL);
    expect(screen.getByTestId('downloaded-video-details')).toHaveTextContent(
      'Server Rack BuildDownloaded · 720p · 220 MBSave to PhotosDelete download',
      { exact: true },
    );
  });

  it('Save to Photos copies the file, disabled while it runs', async () => {
    mockMediaLibrary.autoSave = false;
    await renderDetails();
    expect(saveButton()).toBeEnabled();
    await fireEvent.press(saveButton());
    expect(saveButton()).toBeDisabled();
    expect(screen.getByTestId('save-to-photos-status')).toHaveTextContent('Saving to Photos…');

    await act(async () => {
      mockMediaLibrary.finishSave();
      await Promise.resolve();
    });
    expect(mockMediaLibrary.saved).toEqual([downloadUri('post-1')]);
    expect(saveButton()).toBeEnabled();
    expect(screen.getByTestId('save-to-photos-status')).toHaveTextContent('Saved to Photos.');
  });

  it('Delete asks first, then deletes and reports back', async () => {
    const { onDeleted } = await renderDetails();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete download' }));
    expect(lastAlert(alert).title).toBe('Delete this download?');
    expect(onDeleted).not.toHaveBeenCalled();
    await act(() => {
      pressAlertButton(alert, 'Delete');
    });
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(mockFileSystem.files.has(downloadUri('post-1'))).toBe(false);
  });
});
