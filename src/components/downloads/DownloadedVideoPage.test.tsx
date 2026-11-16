import { Alert } from 'react-native';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DownloadedVideoPage } from '@/components/downloads/DownloadedVideoPage';
import { PlaybackProvider, PlaybackStore } from '@/components/player/PlaybackSession';
import { useStopDownloadsOnSignOut } from '@/hooks/use-video-download';
import { pressAlertButton, spyOnAlert } from '@test/alert';
import { downloadUri, makeDownloadedVideo, seedDownloads } from '@test/fixtures-downloads';
import { mockFileSystem } from '@test/mocks/expo-file-system';
import { mockVideoPlayerState } from '@test/mocks/expo-video';

const mockRouter = { canGoBack: () => true, back: jest.fn(), replace: jest.fn() };
const mockSetOptions = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useNavigation: () => ({ setOptions: mockSetOptions }),
}));

let alert: ReturnType<typeof spyOnAlert>;

beforeEach(() => {
  mockRouter.back.mockReset();
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

async function renderPage(id = 'post-1') {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <PlaybackProvider>
        <DownloadedVideoPage id={id} />
      </PlaybackProvider>
    </SafeAreaProvider>,
  );
}

describe('DownloadedVideoPage', () => {
  it('plays the local file, labelled with the saved thumbnail', async () => {
    seedDownloads(mockFileSystem);
    await renderPage();
    expect(mockVideoPlayerState.lastPlayer().source).toEqual({
      uri: downloadUri('post-1'),
      metadata: {
        title: 'Home Lab Tour',
        artist: 'Tech Channel',
        artwork: downloadUri('post-1', 'jpg'),
      },
    });
    expect(screen.getByTestId('downloaded-video-details')).toHaveTextContent(/Home Lab Tour/);
  });

  it('labels a download without channel or thumbnail by its title only', async () => {
    seedDownloads(mockFileSystem, [
      {
        postId: 'p',
        title: 'Bare',
        label: '360p',
        sizeBytes: 1,
        downloadedAt: 'x',
        hasThumbnail: false,
      },
    ]);
    await renderPage('p');
    expect(mockVideoPlayerState.lastPlayer().source).toEqual({
      uri: downloadUri('p'),
      metadata: { title: 'Bare' },
    });
  });

  it('stops whatever the mini player was playing', async () => {
    seedDownloads(mockFileSystem);
    const close = jest.spyOn(PlaybackStore.prototype, 'close');
    await renderPage();
    // The app's store: the page's own player lives in a private one and isn't closed.
    expect(close).toHaveBeenCalledTimes(1);
    expect(mockVideoPlayerState.lastPlayer().released).toBe(false);
    close.mockRestore();
  });

  it('keeps the back swipe outside fullscreen', async () => {
    seedDownloads(mockFileSystem);
    await renderPage();
    expect(mockSetOptions).toHaveBeenLastCalledWith({ gestureEnabled: true });
  });

  it('fullscreen: the player takes the page, without details or back swipe', async () => {
    seedDownloads(mockFileSystem);
    await renderPage();
    await fireEvent.press(screen.getByLabelText('Enter fullscreen'));
    expect(screen.queryByTestId('downloaded-video-details')).toBeNull();
    expect(mockSetOptions).toHaveBeenLastCalledWith({ gestureEnabled: false });
    expect(screen.getByTestId('downloaded-video-screen')).toHaveStyle({ paddingTop: 0 });
  });

  it('the close arrow goes back', async () => {
    seedDownloads(mockFileSystem);
    await renderPage();
    await fireEvent.press(screen.getByLabelText('Close video'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('deleting the download closes the page', async () => {
    seedDownloads(mockFileSystem, [makeDownloadedVideo()]);
    await renderPage();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete download' }));
    await act(() => {
      pressAlertButton(alert, 'Delete');
    });
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it("a download that's gone: says so, and offers Back", async () => {
    await renderPage('missing');
    expect(screen.getByText("This download isn't on this device anymore.")).toBeTruthy();
    expect(screen.queryByTestId('downloaded-video-details')).toBeNull();
    expect(mockVideoPlayerState.players).toHaveLength(0);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});
