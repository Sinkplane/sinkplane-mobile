import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

interface PlayerPageMode {
  /** Fullscreen or tabletop: the player takes the whole screen and the details are hidden. */
  immersive: boolean;
  /** Large screen in landscape: the details sit beside the player instead of under it. */
  sideBySide: boolean;
}

interface PlayerPageStyles {
  page: StyleProp<ViewStyle>;
  player: ViewStyle | undefined;
  details: ViewStyle | undefined;
}

/**
 * Styles for the three parts of a player page (video / live): the page itself, the column holding
 * the player, and the scrolling details. Stacked by default; a row on wide screens; just the
 * player when immersive.
 */
export function playerPageLayout(
  { immersive, sideBySide }: PlayerPageMode,
  insets: EdgeInsets,
): PlayerPageStyles {
  const page: StyleProp<ViewStyle> = [
    styles.page,
    { paddingTop: immersive ? 0 : insets.top },
    immersive && styles.immersivePage,
    sideBySide && [styles.sideBySidePage, { paddingLeft: insets.left, paddingRight: insets.right }],
  ];
  return {
    page,
    player: playerStyle({ immersive, sideBySide }),
    details: sideBySide ? styles.detailsColumn : undefined,
  };
}

function playerStyle({ immersive, sideBySide }: PlayerPageMode): ViewStyle | undefined {
  if (sideBySide) {
    return styles.playerColumn;
  }
  return immersive ? styles.immersivePlayer : undefined;
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  immersivePage: {
    backgroundColor: '#000',
  },
  sideBySidePage: {
    flexDirection: 'row',
    gap: 8,
  },
  immersivePlayer: {
    flex: 1,
  },
  // Explicit grow/basis rather than `flex`: the details are a ScrollView, whose own `flexGrow: 1`
  // would override the shorthand. Two thirds for the player, one third for the details.
  playerColumn: {
    flexGrow: 2,
    flexShrink: 1,
    flexBasis: 0,
  },
  detailsColumn: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
});
