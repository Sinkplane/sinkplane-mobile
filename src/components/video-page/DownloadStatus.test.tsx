import { render, screen } from '@testing-library/react-native';

import { DownloadStatus } from '@/components/video-page/DownloadStatus';
import type { VideoDownloadState } from '@/hooks/use-video-download';

describe('DownloadStatus', () => {
  it.each<VideoDownloadState>([
    { status: 'idle' },
    { status: 'downloading', label: '720p', progress: 0.5 },
    {
      status: 'downloaded',
      video: {
        postId: 'post-1',
        title: 'Home Lab Tour',
        label: '720p',
        sizeBytes: 1000,
        downloadedAt: '2026-11-15T10:00:00.000Z',
        hasThumbnail: false,
      },
    },
  ])('shows nothing when %j', async (state) => {
    await render(<DownloadStatus state={state} />);
    expect(screen.queryByTestId('download-status')).toBeNull();
  });

  it('reports a failed download', async () => {
    await render(<DownloadStatus state={{ status: 'failed', label: '720p' }} />);
    expect(screen.getByTestId('download-status')).toHaveTextContent(
      "Couldn't download 720p. Try again.",
    );
  });
});
