import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

interface PlayerPageMode {
  /** Fullscreen or tabletop: the player takes the whole screen and the details are hidden. */
  immersive: boolean;
  /** Large screen in landscape: still stacked, but the player's height is capped (see below). */
  wide: boolean;
}

interface WindowSize {
  width: number;
  height: number;
}

interface PlayerPageStyles {
  page: StyleProp<ViewStyle>;
  player: ViewStyle | undefined;
}

const ASPECT_WIDTH = 16;
const ASPECT_HEIGHT = 9;

/**
 * Share of the window height a wide (landscape tablet) player may take. A full-width 16:9 player
 * would fill ~75-80% of a landscape iPad and leave the details a sliver.
 */
const WIDE_PLAYER_MAX_HEIGHT = 0.6;

/**
 * Styles for the two parts of a player page (video / live): the page itself and the column
 * holding the player. The details always scroll below the player; when immersive they're hidden
 * and the player fills the page. On wide screens the player column is narrowed (and centered) so
 * its 16:9 height stays under `WIDE_PLAYER_MAX_HEIGHT` of the window.
 */
export function playerPageLayout(
  { immersive, wide }: PlayerPageMode,
  insets: EdgeInsets,
  window: WindowSize,
): PlayerPageStyles {
  const page: StyleProp<ViewStyle> = [
    styles.page,
    { paddingTop: immersive ? 0 : insets.top },
    immersive && styles.immersivePage,
  ];
  return { page, player: playerStyle({ immersive, wide }, insets, window) };
}

function playerStyle(
  { immersive, wide }: PlayerPageMode,
  insets: EdgeInsets,
  window: WindowSize,
): ViewStyle | undefined {
  if (immersive) {
    return styles.immersivePlayer;
  }
  if (!wide) {
    return undefined;
  }
  const width = Math.min(
    window.width - insets.left - insets.right,
    (window.height * WIDE_PLAYER_MAX_HEIGHT * ASPECT_WIDTH) / ASPECT_HEIGHT,
  );
  return { alignSelf: 'center', width };
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  immersivePage: {
    backgroundColor: '#000',
  },
  immersivePlayer: {
    flex: 1,
  },
});
