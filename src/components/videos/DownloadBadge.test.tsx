import { act, render, renderHook, screen } from '@testing-library/react-native';

import { DownloadBadge } from '@/components/videos/DownloadBadge';
import { useStopDownloadsOnSignOut, useVideoDownload } from '@/hooks/use-video-download';
import {
  downloadTarget,
  finishDownload,
  OPTION_720,
  settle,
  setUpDownloadStoreTests,
} from '@test/download-store';
import { mockFileSystem } from '@test/mocks/expo-file-system';

setUpDownloadStoreTests();

const badge = () => screen.queryByTestId('download-badge-post-1');

/** Starts a download of post-1 from a hook that stays mounted. */
async function startPost1(): Promise<void> {
  const { result } = await renderHook(() => useVideoDownload(downloadTarget(), 'token'));
  await act(() => {
    result.current.start(OPTION_720);
  });
}

describe('DownloadBadge', () => {
  it('renders nothing for a post that is not downloaded', async () => {
    await render(<DownloadBadge postId="post-1" />);
    expect(badge()).toBeNull();
  });

  it('a download without a size yet: a spinner, no percent', async () => {
    await startPost1();
    await render(<DownloadBadge postId="post-1" />);
    expect(badge()).toHaveAccessibleName('Downloading…');
    expect(badge()).toHaveTextContent('', { exact: true });
  });

  it('shows the percent while downloading', async () => {
    await startPost1();
    await render(<DownloadBadge postId="post-1" />);
    await act(() => {
      mockFileSystem.lastDownload().progress(42, 100);
    });
    expect(badge()).toHaveAccessibleName('Downloading 42%');
    expect(badge()).toHaveTextContent('42%', { exact: true });
  });

  it('shows Downloaded once the video is on the device, and not for other posts', async () => {
    await startPost1();
    await render(
      <>
        <DownloadBadge postId="post-1" />
        <DownloadBadge postId="post-2" />
      </>,
    );
    await finishDownload();
    expect(badge()).toHaveAccessibleName('Downloaded');
    expect(badge()).toHaveTextContent('', { exact: true });
    expect(screen.queryByTestId('download-badge-post-2')).toBeNull();
  });

  it('goes away when the download is cancelled', async () => {
    const { result } = await renderHook(() => useVideoDownload(downloadTarget(), 'token'));
    await act(() => {
      result.current.start(OPTION_720);
    });
    await render(<DownloadBadge postId="post-1" />);
    expect(badge()).not.toBeNull();
    await act(() => {
      result.current.cancel();
    });
    await settle();
    expect(badge()).toBeNull();
    await renderHook(() => {
      useStopDownloadsOnSignOut(false);
    });
  });
});
