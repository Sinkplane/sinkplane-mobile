import { renderHook } from '@testing-library/react-native';

import { useOpenVideo } from '@/components/videos/use-open-video';

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

describe('useOpenVideo', () => {
  it('pushes the video page of the given post', async () => {
    const { result } = await renderHook(() => useOpenVideo());

    result.current({ id: 'post-1' });

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/video/[id]',
      params: { id: 'post-1' },
    });
  });
});
