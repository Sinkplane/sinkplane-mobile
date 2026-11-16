import { fireEvent, render, screen } from '@testing-library/react-native';

import { DownloadRow } from '@/components/downloads/DownloadRow';
import { DOWNLOADED_VIDEOS, downloadUri } from '@test/fixtures-downloads';

const [NO_CHANNEL, WITH_CHANNEL] = DOWNLOADED_VIDEOS as [
  (typeof DOWNLOADED_VIDEOS)[0],
  (typeof DOWNLOADED_VIDEOS)[0],
];

async function renderRow(video = WITH_CHANNEL) {
  const onPress = jest.fn();
  const onMore = jest.fn();
  await render(<DownloadRow video={video} onPress={onPress} onMore={onMore} />);
  return { onPress, onMore };
}

describe('DownloadRow', () => {
  it('shows the title, channel, quality and size, and the saved thumbnail', async () => {
    await renderRow();
    const row = screen.getByTestId('download-row-post-1');
    expect(row).toHaveTextContent('Home Lab TourTech Channel1080p · 1.2 GB', { exact: true });
    expect(row).toHaveAccessibleName('Home Lab Tour');
    expect(screen.getByTestId('download-thumbnail-post-1').props['source']).toEqual([
      { uri: downloadUri('post-1', 'jpg') },
    ]);
  });

  it('leaves out a missing channel and thumbnail', async () => {
    await renderRow(NO_CHANNEL);
    expect(screen.getByTestId('download-row-post-2')).toHaveTextContent(
      'Server Rack Build720p · 220 MB',
      { exact: true },
    );
    expect(screen.getByTestId('download-thumbnail-post-2').props['source']).toEqual([]);
  });

  it('plays on press', async () => {
    const { onPress, onMore } = await renderRow();
    await fireEvent.press(screen.getByTestId('download-row-post-1'));
    expect(onPress).toHaveBeenCalledWith(WITH_CHANNEL);
    expect(onMore).not.toHaveBeenCalled();
  });

  it('opens the actions from the more button, or a long press', async () => {
    const { onPress, onMore } = await renderRow();
    await fireEvent.press(screen.getByRole('button', { name: 'More actions for Home Lab Tour' }));
    expect(onMore).toHaveBeenCalledWith(WITH_CHANNEL);
    await fireEvent(screen.getByTestId('download-row-post-1'), 'longPress');
    expect(onMore).toHaveBeenCalledTimes(2);
    expect(onPress).not.toHaveBeenCalled();
  });
});
