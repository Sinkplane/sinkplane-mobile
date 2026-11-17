import { Alert } from 'react-native';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';

import { DownloadedVideosList } from '@/components/settings/DownloadedVideosList';
import { useStopDownloadsOnSignOut } from '@/hooks/use-video-download';
import { pressAlertButton, lastAlert, spyOnAlert } from '@test/alert';
import { downloadUri, seedDownloads } from '@test/fixtures-downloads';
import { mockFileSystem } from '@test/mocks/expo-file-system';

let alert: ReturnType<typeof spyOnAlert>;

beforeEach(() => {
  alert = spyOnAlert(Alert);
});

afterEach(async () => {
  await renderHook(() => {
    useStopDownloadsOnSignOut(false);
  });
});

const showList = () =>
  fireEvent(screen.getByTestId('settings-show-downloads'), 'valueChange', true);

describe('DownloadedVideosList', () => {
  it('renders nothing without downloads', async () => {
    await render(<DownloadedVideosList />);
    expect(screen.queryByTestId('settings-show-downloads')).toBeNull();
  });

  it('has the list hidden until the switch is turned on, and off again', async () => {
    seedDownloads(mockFileSystem);
    await render(<DownloadedVideosList />);
    expect(screen.getByText('Show downloaded videos')).toBeTruthy();
    expect(screen.getByTestId('settings-show-downloads').props['value']).toBe(false);
    expect(screen.queryByTestId('settings-downloaded-list')).toBeNull();

    await showList();
    expect(screen.getByTestId('settings-show-downloads').props['value']).toBe(true);
    expect(screen.getByTestId('settings-downloaded-list')).toBeTruthy();

    await fireEvent(screen.getByTestId('settings-show-downloads'), 'valueChange', false);
    expect(screen.queryByTestId('settings-downloaded-list')).toBeNull();
  });

  it('lists each download with its title, detail and saved thumbnail', async () => {
    seedDownloads(mockFileSystem);
    await render(<DownloadedVideosList />);
    await showList();
    const first = screen.getByTestId('settings-download-post-2');
    expect(first).toHaveTextContent('Server Rack Build720p · 220 MB', { exact: true });
    expect(screen.getByTestId('settings-download-post-1')).toHaveTextContent(
      'Home Lab Tour1080p · 1.2 GB',
      { exact: true },
    );
    expect(screen.getAllByTestId(/^settings-download-post-/)).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Delete Home Lab Tour' })).toBeTruthy();
  });

  it('the trash button asks first; Cancel keeps the download, Delete removes only that one', async () => {
    seedDownloads(mockFileSystem);
    await render(<DownloadedVideosList />);
    await showList();

    await fireEvent.press(screen.getByTestId('settings-delete-download-post-1'));
    expect(lastAlert(alert)).toMatchObject({
      title: 'Delete this download?',
      message: 'Home Lab Tour will be removed from this device.',
    });
    expect(screen.getByTestId('settings-download-post-1')).toBeTruthy();

    await act(async () => {
      pressAlertButton(alert, 'Delete');
      await Promise.resolve();
    });
    expect(screen.queryByTestId('settings-download-post-1')).toBeNull();
    expect(screen.getByTestId('settings-download-post-2')).toBeTruthy();
    expect(mockFileSystem.files.has(downloadUri('post-1'))).toBe(false);
    expect(mockFileSystem.files.has(downloadUri('post-2'))).toBe(true);
  });

  it('Delete all asks first, then removes everything and the list disappears', async () => {
    seedDownloads(mockFileSystem);
    await render(<DownloadedVideosList />);
    await showList();

    await fireEvent.press(screen.getByTestId('settings-delete-all-downloads'));
    expect(lastAlert(alert).title).toBe('Delete all downloads?');
    expect(screen.getAllByTestId(/^settings-download-post-/)).toHaveLength(2);

    await act(async () => {
      pressAlertButton(alert, 'Delete all');
      await Promise.resolve();
    });
    expect(screen.queryByTestId('settings-show-downloads')).toBeNull();
    expect(mockFileSystem.files.has(downloadUri('post-1'))).toBe(false);
    expect(mockFileSystem.files.has(downloadUri('post-2'))).toBe(false);
  });
});
