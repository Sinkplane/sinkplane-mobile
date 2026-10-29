import { Platform } from 'react-native';
import { renderHook } from '@testing-library/react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabScreenInsets } from '@/hooks/use-tab-screen-insets';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: jest.fn(),
}));

const mockedInsets = jest.mocked(useSafeAreaInsets);

describe('useTabScreenInsets', () => {
  beforeEach(() => {
    mockedInsets.mockReturnValue({ top: 59, bottom: 83, left: 0, right: 0 });
  });

  it('pads both the status bar and the tab bar on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const { result } = await renderHook(() => useTabScreenInsets());
    expect(result.current).toEqual({ top: 59, bottom: 83 });
  });

  it('only pads the status bar on Android (native tabs already inset the bottom)', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const { result } = await renderHook(() => useTabScreenInsets());
    expect(result.current).toEqual({ top: 59, bottom: 0 });
  });
});
