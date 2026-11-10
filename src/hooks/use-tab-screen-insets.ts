import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Safe-area padding for a header-less tab screen.
 *
 * Native tabs' automatic content insets are disabled on iOS (see `(tabs)/_layout.tsx`)
 * because they don't reliably inset the top of the screen, so the screen pads itself:
 * `top` clears the status bar, `bottom` clears the tab bar (each iOS tab gets its own
 * SafeAreaProvider whose bottom inset includes the tab bar). On Android the tab
 * content is already laid out above the tab bar, so only the top needs padding.
 */
export interface TabScreenInsets {
  top: number;
  bottom: number;
}

export function useTabScreenInsets(): TabScreenInsets {
  const insets = useSafeAreaInsets();
  return { top: insets.top, bottom: Platform.OS === 'ios' ? insets.bottom : 0 };
}
