import { AppState, Linking, type AppStateStatus } from 'react-native';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OfflineDownloads } from '@/components/videos/OfflineDownloads';
import { useStopDownloadsOnSignOut } from '@/hooks/use-video-download';
import { seedDownloads } from '@test/fixtures-downloads';
import { mockFileSystem } from '@test/mocks/expo-file-system';
import { mockNetwork } from '@test/mocks/expo-network';

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const mockRetry = jest.fn<Promise<void>, []>();
jest.mock('@/shared', () => ({
  ...jest.requireActual<object>('@/shared'),
  useSession: () => ({ retry: mockRetry }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, bottom: 34, left: 0, right: 0 },
};

let appStateHandlers: ((state: AppStateStatus) => void)[];
let removed: jest.Mock;

beforeEach(() => {
  mockRouter.push.mockReset();
  mockRetry.mockReset();
  mockRetry.mockResolvedValue(undefined);
  appStateHandlers = [];
  removed = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    appStateHandlers.push(handler);
    return { remove: removed };
  });
});

afterEach(async () => {
  jest.restoreAllMocks();
  await renderHook(() => {
    useStopDownloadsOnSignOut(false);
  });
});

async function renderOffline() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <OfflineDownloads />
    </SafeAreaProvider>,
  );
}

interface RefreshProps {
  readonly onRefresh: () => void;
  readonly refreshing: boolean;
}
const refreshProps = (): RefreshProps => {
  const control = screen.getByTestId('offline-downloads').props['refreshControl'] as {
    props: RefreshProps;
  };
  return control.props;
};
const retryButton = () => screen.getByTestId('offline-retry');

describe('OfflineDownloads', () => {
  it('explains that you are offline and lists the downloads, newest first', async () => {
    seedDownloads(mockFileSystem);
    await renderOffline();
    const banner = screen.getByTestId('offline-banner');
    expect(banner).toHaveTextContent(
      "You're offlineHere are the videos you've downloaded. To see all videos, check your connection or mobile data settings.Try again",
      { exact: true },
    );
    expect(
      screen.getAllByTestId(/^download-row-/).map((row) => String(row.props['testID'])),
    ).toEqual(['download-row-post-2', 'download-row-post-1']);
    expect(screen.queryByTestId('offline-downloads-empty')).toBeNull();
  });

  it('without downloads: says so, still with the banner', async () => {
    await renderOffline();
    expect(screen.getByTestId('offline-downloads-empty')).toHaveTextContent(
      "You haven't downloaded any videos yet.",
    );
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
  });

  it('a row opens the downloaded video', async () => {
    seedDownloads(mockFileSystem);
    await renderOffline();
    await fireEvent.press(screen.getByTestId('download-row-post-1'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/video/[id]',
      params: { id: 'post-1' },
    });
  });

  it('the settings link opens the system settings', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await renderOffline();
    await fireEvent.press(screen.getByTestId('offline-open-settings'));
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('Try again retries; the button reads "Trying again…" and is disabled meanwhile', async () => {
    let finish: () => void = () => undefined;
    mockRetry.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    await renderOffline();
    expect(retryButton()).toHaveTextContent('Try again', { exact: true });
    expect(retryButton()).toBeEnabled();
    expect(retryButton().props['accessibilityState']).toEqual({ disabled: false });

    await fireEvent.press(retryButton());
    expect(mockRetry).toHaveBeenCalledTimes(1);
    expect(retryButton()).toHaveTextContent('Trying again…', { exact: true });
    expect(retryButton()).toBeDisabled();
    expect(retryButton().props['accessibilityState']).toEqual({ disabled: true });
    expect(refreshProps().refreshing).toBe(true);

    await act(async () => {
      finish();
      await Promise.resolve();
    });
    expect(retryButton()).toHaveTextContent('Try again', { exact: true });
    expect(retryButton()).toBeEnabled();
  });

  it('pull-to-refresh retries', async () => {
    await renderOffline();
    expect(mockRetry).not.toHaveBeenCalled();
    const { onRefresh, refreshing } = refreshProps();
    expect(refreshing).toBe(false);
    await act(async () => {
      onRefresh();
      await Promise.resolve();
    });
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it('retries when the app comes back to the foreground, not for other states', async () => {
    await renderOffline();
    expect(appStateHandlers).toHaveLength(1);
    await act(async () => {
      appStateHandlers[0]?.('background');
      appStateHandlers[0]?.('inactive');
      await Promise.resolve();
    });
    expect(mockRetry).not.toHaveBeenCalled();

    await act(async () => {
      appStateHandlers[0]?.('active');
      await Promise.resolve();
    });
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it('stops listening to the app state when it goes away', async () => {
    await renderOffline();
    await screen.unmount();
    expect(removed).toHaveBeenCalledTimes(1);
  });

  it('retries when the network comes back, not on mount or while it stays down', async () => {
    mockNetwork.offline();
    await renderOffline();
    expect(mockRetry).not.toHaveBeenCalled();

    await act(() => {
      mockNetwork.set({ isConnected: false, isInternetReachable: false });
    });
    expect(mockRetry).not.toHaveBeenCalled();

    await act(async () => {
      mockNetwork.online();
      await Promise.resolve();
    });
    expect(mockRetry).toHaveBeenCalledTimes(1);

    await act(async () => {
      mockNetwork.set({ isConnected: true, isInternetReachable: true });
      await Promise.resolve();
    });
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it('does not retry on mount when the network is already available', async () => {
    mockNetwork.online();
    await renderOffline();
    expect(mockRetry).not.toHaveBeenCalled();
  });
});
