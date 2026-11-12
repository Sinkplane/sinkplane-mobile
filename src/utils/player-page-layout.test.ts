import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

import { playerPageLayout } from '@/utils/player-page-layout';

const INSETS: EdgeInsets = { top: 59, bottom: 34, left: 0, right: 0 };
const PHONE = { width: 390, height: 844 };
const TABLET_LANDSCAPE = { width: 1366, height: 1024 };
const style = (prop: StyleProp<ViewStyle>): ViewStyle => StyleSheet.flatten(prop) ?? {};

describe('playerPageLayout', () => {
  it('stacks by default: page fills the screen below the top inset, full-width player', () => {
    const { page, player } = playerPageLayout({ immersive: false, wide: false }, INSETS, PHONE);
    expect(style(page)).toMatchObject({ flex: 1, paddingTop: 59 });
    expect(style(page).flexDirection).toBeUndefined();
    expect(player).toBeUndefined();
  });

  it('immersive: black page under the notch-to-chin player', () => {
    const { page, player } = playerPageLayout({ immersive: true, wide: false }, INSETS, PHONE);
    expect(style(page)).toMatchObject({ flex: 1, paddingTop: 0, backgroundColor: '#000' });
    expect(style(player)).toMatchObject({ flex: 1 });
  });

  it('wide: still stacked, a centered player whose 16:9 height is capped at 60% of the window', () => {
    const insets = { top: 24, bottom: 20, left: 0, right: 0 };
    const { page, player } = playerPageLayout(
      { immersive: false, wide: true },
      insets,
      TABLET_LANDSCAPE,
    );
    expect(style(page)).toMatchObject({ flex: 1, paddingTop: 24 });
    expect(style(page).flexDirection).toBeUndefined();
    expect(style(player)).toMatchObject({ alignSelf: 'center', width: (1024 * 0.6 * 16) / 9 });
  });

  it('wide never gets wider than the window minus its side insets', () => {
    const insets = { top: 0, bottom: 0, left: 40, right: 40 };
    const window = { width: 1000, height: 900 };
    const { player } = playerPageLayout({ immersive: false, wide: true }, insets, window);
    expect(style(player).width).toBe(920);
  });

  it('immersive wins over wide (fullscreen from a landscape tablet)', () => {
    const { page, player } = playerPageLayout(
      { immersive: true, wide: true },
      INSETS,
      TABLET_LANDSCAPE,
    );
    expect(style(page)).toMatchObject({ paddingTop: 0, backgroundColor: '#000' });
    expect(style(player)).toEqual({ flex: 1 });
  });
});
