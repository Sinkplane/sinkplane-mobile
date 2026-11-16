import { fireEvent, render, renderHook, screen } from '@testing-library/react-native';

import { DownloadsLink } from '@/components/sign-in/DownloadsLink';
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

describe('DownloadsLink', () => {
  it('is hidden without downloads', async () => {
    await render(<DownloadsLink />);
    expect(screen.queryByTestId('sign-in-downloads')).toBeNull();
  });

  it('links to the downloads, with their count', async () => {
    seedDownloads(mockFileSystem);
    await render(<DownloadsLink />);
    const link = screen.getByRole('link', { name: 'Watch downloaded videos (2)' });
    await fireEvent.press(link);
    expect(mockRouter.push).toHaveBeenCalledWith('/downloads');
  });
});
