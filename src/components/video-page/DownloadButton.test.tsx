import { fireEvent, render, screen } from '@testing-library/react-native';

import { DownloadButton } from '@/components/video-page/DownloadButton';
import type { VideoDownloadState } from '@/hooks/use-video-download';

const DOWNLOADED: VideoDownloadState = {
  status: 'downloaded',
  video: {
    postId: 'post-1',
    title: 'Home Lab Tour',
    label: '720p',
    sizeBytes: 1000,
    downloadedAt: '2026-11-15T10:00:00.000Z',
    hasThumbnail: false,
  },
};

async function renderButton(state: VideoDownloadState) {
  const onPress = jest.fn();
  const onCancel = jest.fn();
  await render(<DownloadButton state={state} onPress={onPress} onCancel={onCancel} />);
  return { onPress, onCancel };
}

const button = () => screen.getByTestId('download-button');

describe('DownloadButton', () => {
  it.each<[VideoDownloadState, string]>([
    [{ status: 'idle' }, 'Download'],
    [{ status: 'failed', label: '720p' }, 'Download'],
    [DOWNLOADED, 'Downloaded'],
    [{ status: 'downloading', label: '720p', progress: null }, 'Downloading…'],
    [{ status: 'downloading', label: '720p', progress: 0.428 }, 'Downloading 42%'],
    [{ status: 'downloading', label: '720p', progress: 1 }, 'Downloading 100%'],
  ])('%j reads "%s"', async (state, label) => {
    await renderButton(state);
    expect(button()).toHaveTextContent(label);
    expect(button()).toHaveAccessibleName(label);
  });

  it.each<VideoDownloadState>([
    { status: 'idle' },
    DOWNLOADED,
    { status: 'failed', label: '720p' },
  ])('is pressable when %j', async (state) => {
    const { onPress } = await renderButton(state);
    expect(button()).toBeEnabled();
    await fireEvent.press(button());
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('download-cancel')).toBeNull();
  });

  it('is disabled while downloading, with a Cancel button', async () => {
    const { onPress, onCancel } = await renderButton({
      status: 'downloading',
      label: '720p',
      progress: 0.5,
    });
    expect(button()).toBeDisabled();
    expect(button()).toBeBusy();
    await fireEvent.press(button());
    expect(onPress).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel download' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it.each<[VideoDownloadState, string]>([
    [{ status: 'idle' }, 'arrow.down.circle'],
    [{ status: 'failed', label: '720p' }, 'arrow.down.circle'],
    [DOWNLOADED, 'checkmark.circle'],
  ])('%j shows the %s icon', async (state, ios) => {
    await renderButton(state);
    // The test platform is iOS: the native view gets the SF Symbol name.
    expect(screen.getByTestId('download-icon').props).toMatchObject({ name: ios });
    expect(screen.queryByTestId('download-spinner')).toBeNull();
  });

  it('shows a spinner instead of the icon while downloading', async () => {
    await renderButton({ status: 'downloading', label: '720p', progress: 0.1 });
    expect(screen.getByTestId('download-spinner')).toBeTruthy();
    expect(screen.queryByTestId('download-icon')).toBeNull();
  });
});
