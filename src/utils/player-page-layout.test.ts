import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

import { playerPageLayout } from '@/utils/player-page-layout';

const INSETS: EdgeInsets = { top: 59, bottom: 34, left: 0, right: 0 };
const style = (prop: StyleProp<ViewStyle>): ViewStyle => StyleSheet.flatten(prop) ?? {};

describe('playerPageLayout', () => {
  it('stacks by default: page fills the screen below the top inset, player and details share the column', () => {
    const { page, player, details } = playerPageLayout(
      { immersive: false, sideBySide: false },
      INSETS,
    );
    expect(style(page)).toMatchObject({ flex: 1, paddingTop: 59 });
    expect(player).toBeUndefined();
    expect(details).toBeUndefined();
  });

  it('immersive: black page under the notch-to-chin player, details gone (page style carries both modes)', () => {
    const { page, player, details } = playerPageLayout(
      { immersive: true, sideBySide: false },
      INSETS,
    );
    expect(style(page)).toMatchObject({ flex: 1, paddingTop: 0, backgroundColor: '#000' });
    expect(style(player)).toMatchObject({ flex: 1 });
    expect(details).toBeUndefined();
  });

  it('side-by-side: a row with the player at 2/3 and the details at 1/3, side insets respected', () => {
    const { page, player, details } = playerPageLayout(
      { immersive: false, sideBySide: true },
      { top: 24, bottom: 20, left: 50, right: 44 },
    );
    expect(style(page)).toMatchObject({
      flex: 1,
      paddingTop: 24,
      flexDirection: 'row',
      paddingLeft: 50,
      paddingRight: 44,
    });
    // flexGrow/basis rather than `flex`: the details are a ScrollView whose flexGrow would override the shorthand.
    expect(style(player)).toMatchObject({ flexGrow: 2, flexShrink: 1, flexBasis: 0 });
    expect(style(details)).toMatchObject({ flexGrow: 1, flexShrink: 1, flexBasis: 0 });
  });

  it('immersive wins over side-by-side (fullscreen from a landscape tablet)', () => {
    // usePlayerPage never reports sideBySide while immersive; if it ever did, the details are
    // unmounted anyway and the lone player column still fills the black page.
    const { page, player, details } = playerPageLayout(
      { immersive: true, sideBySide: true },
      INSETS,
    );
    expect(style(page)).toMatchObject({ flex: 1, paddingTop: 0, backgroundColor: '#000' });
    expect(style(player)).toMatchObject({ flexGrow: 2, flexShrink: 1, flexBasis: 0 });
    expect(style(details)).toMatchObject({ flexGrow: 1 });
  });
});
