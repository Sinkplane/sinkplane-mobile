import { fireEvent, render, renderHook, screen } from '@testing-library/react-native';

import { DownloadsRow } from '@/components/settings/DownloadsRow';
import { useStopDownloadsOnSignOut } from '@/hooks/use-video-download';
import { seedDownloads } from '@test/fixtures-downloads';
import { mockFileSystem } from '@test/mocks/expo-file-system';

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

afterEach(async () => {
  mockRouter.push.mockReset();
  await renderHook(() => {
    useStopDownloadsOnSignOut(false);
  });
});

describe('DownloadsRow', () => {
  it('says there are none yet', async () => {
    await render(<DownloadsRow />);
    expect(screen.getByTestId('settings-downloads')).toHaveTextContent(
      'Downloaded videosNone yet',
      { exact: true },
    );
    expect(screen.getByTestId('settings-downloads')).toHaveAccessibleName(
      'Downloaded videos, None yet',
    );
  });

  it('sums up the downloads, and opens them', async () => {
    seedDownloads(mockFileSystem);
    await render(<DownloadsRow />);
    expect(screen.getByTestId('settings-downloads')).toHaveTextContent(
      'Downloaded videos2 videos · 1.4 GB',
      { exact: true },
    );
    await fireEvent.press(screen.getByRole('button', { name: /^Downloaded videos/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/downloads');
  });
});
