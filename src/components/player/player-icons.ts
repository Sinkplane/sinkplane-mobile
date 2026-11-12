import type { SymbolViewProps } from 'expo-symbols';

export type IconName = SymbolViewProps['name'];

/** The player controls' icons: SF Symbols on iOS, Material Symbols on Android and web. */
export const ICONS = {
  close: { ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' },
  back: { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' },
  play: { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' },
  pause: { ios: 'pause.fill', android: 'pause', web: 'pause' },
  replay: { ios: 'arrow.counterclockwise', android: 'replay', web: 'replay' },
  skipBack: { ios: 'gobackward.15', android: 'fast_rewind', web: 'fast_rewind' },
  skipForward: { ios: 'goforward.15', android: 'fast_forward', web: 'fast_forward' },
  speed: { ios: 'gauge.with.dots.needle.67percent', android: 'speed', web: 'speed' },
  enterFullscreen: {
    ios: 'arrow.up.left.and.arrow.down.right',
    android: 'fullscreen',
    web: 'fullscreen',
  },
  exitFullscreen: {
    ios: 'arrow.down.right.and.arrow.up.left',
    android: 'fullscreen_exit',
    web: 'fullscreen_exit',
  },
} satisfies Record<string, IconName>;
