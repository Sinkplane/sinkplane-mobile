import { renderHook } from '@testing-library/react-native';

import { useNotificationNavigation } from '@/hooks/use-notification-navigation';
import { makeResponse, mockNotifications, tapNotification } from '@test/mocks/expo-notifications';

const mockPush = jest.fn();
let mockRootState: { key?: string } | undefined;
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useRootNavigationState: () => mockRootState,
}));

beforeEach(() => {
  mockRootState = { key: 'root' };
});

const videoRoute = (id: string) => ({ pathname: '/video/[id]', params: { id } });

describe('useNotificationNavigation', () => {
  it('opens the post of a tapped notification', async () => {
    await renderHook(() => useNotificationNavigation());

    tapNotification({ postId: 'p1' });
    expect(mockPush).toHaveBeenCalledWith(videoRoute('p1'));
    expect(mockNotifications.lastResponse).toBeNull();
  });

  it('ignores taps without a post and non-default actions', async () => {
    await renderHook(() => useNotificationNavigation());

    tapNotification({ postId: '' });
    tapNotification({});
    tapNotification({ postId: 'p1' }, 'dismiss');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('opens the notification that launched the app once navigation is ready', async () => {
    mockNotifications.lastResponse = makeResponse({ postId: 'p2' });
    mockRootState = undefined;
    const { rerender } = await renderHook(() => useNotificationNavigation());
    expect(mockPush).not.toHaveBeenCalled();

    mockRootState = { key: 'root' };
    await rerender({});
    expect(mockPush).toHaveBeenCalledWith(videoRoute('p2'));
    expect(mockNotifications.lastResponse).toBeNull();
  });

  it('stops listening on unmount', async () => {
    const { unmount } = await renderHook(() => useNotificationNavigation());
    await unmount();
    tapNotification({ postId: 'p1' });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
