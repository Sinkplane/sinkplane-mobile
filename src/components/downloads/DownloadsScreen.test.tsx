import { Alert } from 'react-native';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DownloadsScreen } from '@/components/downloads/DownloadsScreen';
import { useStopDownloadsOnSignOut } from '@/hooks/use-video-download';
import { alertLabels, lastAlert, pressAlertButton, spyOnAlert } from '@test/alert';
import { seedDownloads } from '@test/fixtures-downloads';
import { mockFileSystem } from '@test/mocks/expo-file-system';
import { mockMediaLibrary } from '@test/mocks/expo-media-library';

const mockRouter = { push: jest.fn(), canGoBack: () => true, back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

let alert: ReturnType<typeof spyOnAlert>;

beforeEach(() => {
  mockRouter.push.mockReset();
  alert = spyOnAlert(Alert);
});

afterEach(async () => {
  await renderHook(() => {
    useStopDownloadsOnSignOut(false);
  });
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, bottom: 34, left: 0, right: 0 },
};

async function renderScreen() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <DownloadsScreen />
    </SafeAreaProvider>,
  );
}

const rowIds = () =>
  screen
    .getAllByTestId(/^download-row-/)
    .map((row) => String(row.props['testID']).replace('download-row-', ''));

describe('DownloadsScreen', () => {
  it('without downloads: says how to get some', async () => {
    await renderScreen();
    expect(screen.getByRole('header', { name: 'Downloads' })).toBeTruthy();
    expect(screen.getByTestId('downloads-empty')).toHaveTextContent(
      'No downloads yet. Long-press a video, or use Download on its page.',
    );
    expect(screen.queryByTestId('downloads-summary')).toBeNull();
    expect(screen.queryByTestId('downloads-delete-all')).toBeNull();
  });

  it('lists the downloads newest first under their total', async () => {
    seedDownloads(mockFileSystem);
    await renderScreen();
    expect(rowIds()).toEqual(['post-2', 'post-1']);
    expect(screen.getByTestId('downloads-summary')).toHaveTextContent('2 videos · 1.4 GB');
    expect(screen.queryByTestId('downloads-empty')).toBeNull();
    expect(screen.getByTestId('downloads-screen')).toHaveStyle({ paddingTop: 47 });
  });

  it('opens the offline player for a row', async () => {
    seedDownloads(mockFileSystem);
    await renderScreen();
    await fireEvent.press(screen.getByTestId('download-row-post-1'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/downloads/[id]',
      params: { id: 'post-1' },
    });
  });

  it("a row's menu saves to Photos and shows how it went", async () => {
    seedDownloads(mockFileSystem);
    mockMediaLibrary.granted = false;
    await renderScreen();
    expect(screen.queryByTestId('save-to-photos-status')).toBeNull();
    await fireEvent.press(screen.getByTestId('download-more-post-1'));
    expect(lastAlert(alert).title).toBe('Home Lab Tour');
    await act(async () => {
      pressAlertButton(alert, 'Save to Photos');
      await Promise.resolve();
    });
    expect(screen.getByTestId('save-to-photos-status')).toHaveTextContent(
      'Allow access to Photos to save videos. Open Settings',
    );
  });

  it("a row's menu deletes it", async () => {
    seedDownloads(mockFileSystem);
    await renderScreen();
    await fireEvent.press(screen.getByTestId('download-more-post-2'));
    await act(() => {
      pressAlertButton(alert, 'Delete download');
    });
    expect(rowIds()).toEqual(['post-1']);
    expect(screen.getByTestId('downloads-summary')).toHaveTextContent('1 video · 1.2 GB');
  });

  it('Delete all asks, then empties the list', async () => {
    seedDownloads(mockFileSystem);
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete all' }));
    expect(alertLabels(alert)).toEqual(['Cancel', 'Delete all']);
    await act(() => {
      pressAlertButton(alert, 'Delete all');
    });
    expect(screen.queryAllByTestId(/^download-row-/)).toHaveLength(0);
    expect(screen.getByTestId('downloads-empty')).toBeTruthy();
  });
});
