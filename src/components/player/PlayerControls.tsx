import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SEEK_STEP_SECONDS } from '@/components/player/constants';
import { SeekBar } from '@/components/player/SeekBar';
import { formatRate } from '@/components/player/SpeedMenu';
import { formatDuration } from '@/utils/format-video';

export interface PlayerControlsProps {
  title?: string;
  playing: boolean;
  ended: boolean;
  currentTime: number;
  duration: number;
  bufferedPosition: number;
  rate: number;
  fullscreen: boolean;
  onTogglePlay: () => void;
  onSkip: (seconds: number) => void;
  onSeek: (seconds: number) => void;
  onScrub: (seconds: number | null) => void;
  onOpenSpeedMenu: () => void;
  onToggleFullscreen: () => void;
  onBack?: () => void;
}

type IconName = SymbolViewProps['name'];

const ICONS = {
  close: { ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' },
  back: { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' },
  play: { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' },
  pause: { ios: 'pause.fill', android: 'pause', web: 'pause' },
  replay: { ios: 'arrow.counterclockwise', android: 'replay', web: 'replay' },
  skipBack: { ios: 'gobackward.15', android: 'fast_rewind', web: 'fast_rewind' },
  skipForward: { ios: 'goforward.15', android: 'fast_forward', web: 'fast_forward' },
  speed: { ios: 'gauge.with.dots.needle.67percent', android: 'speed', web: 'speed' },
  enterFullscreen: { ios: 'arrow.up.left.and.arrow.down.right', android: 'fullscreen', web: 'fullscreen' },
  exitFullscreen: { ios: 'arrow.down.right.and.arrow.up.left', android: 'fullscreen_exit', web: 'fullscreen_exit' },
} satisfies Record<string, IconName>;

function IconButton({ icon, label, size = 24, onPress }: { icon: IconName; label: string; size?: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <SymbolView name={icon} size={size} tintColor="#fff" />
    </Pressable>
  );
}

/**
 * The on-video control layer: back + speed on top, skip/play in the middle, time, fullscreen and
 * the seek bar at the bottom. Inline, the back button closes the video; in fullscreen it leaves fullscreen.
 * Empty areas pass touches through to the gesture surface beneath.
 */
export function PlayerControls(props: PlayerControlsProps) {
  const { playing, ended, fullscreen, onSkip } = props;
  const insets = useSafeAreaInsets();
  const edges = fullscreen
    ? { paddingLeft: insets.left + 12, paddingRight: insets.right + 12, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) }
    : null;
  const playIcon = ended ? ICONS.replay : playing ? ICONS.pause : ICONS.play;
  const playLabel = ended ? 'Replay' : playing ? 'Pause' : 'Play';

  return (
    <View testID="player-controls" style={[styles.overlay, edges]} pointerEvents="box-none">
      <View style={styles.row} pointerEvents="box-none">
        {fullscreen ? (
          <IconButton icon={ICONS.back} label="Back" onPress={props.onToggleFullscreen} />
        ) : props.onBack ? (
          <IconButton icon={ICONS.close} label="Close video" onPress={props.onBack} />
        ) : null}
        <Text style={styles.title} numberOfLines={1}>
          {fullscreen ? props.title : ''}
        </Text>
        <Pressable
          onPress={props.onOpenSpeedMenu}
          hitSlop={8}
          style={({ pressed }) => [styles.speedButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Playback speed ${formatRate(props.rate)}`}
        >
          <SymbolView name={ICONS.speed} size={18} tintColor="#fff" />
          <Text style={styles.speedText}>{`${props.rate}×`}</Text>
        </Pressable>
      </View>

      <View style={styles.center} pointerEvents="box-none">
        <IconButton
          icon={ICONS.skipBack}
          label={`Back ${SEEK_STEP_SECONDS} seconds`}
          size={30}
          onPress={() => onSkip(-SEEK_STEP_SECONDS)}
        />
        <IconButton icon={playIcon} label={playLabel} size={44} onPress={props.onTogglePlay} />
        <IconButton
          icon={ICONS.skipForward}
          label={`Forward ${SEEK_STEP_SECONDS} seconds`}
          size={30}
          onPress={() => onSkip(SEEK_STEP_SECONDS)}
        />
      </View>

      <View pointerEvents="box-none">
        <View style={styles.row} pointerEvents="box-none">
          <Text testID="player-time" style={styles.time}>
            {`${formatDuration(props.currentTime)} / ${formatDuration(props.duration)}`}
          </Text>
          <IconButton
            icon={fullscreen ? ICONS.exitFullscreen : ICONS.enterFullscreen}
            label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            size={20}
            onPress={props.onToggleFullscreen}
          />
        </View>
        <SeekBar
          currentTime={props.currentTime}
          duration={props.duration}
          bufferedPosition={props.bufferedPosition}
          onSeek={props.onSeek}
          onScrub={props.onScrub}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  center: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  iconButton: {
    padding: 6,
  },
  pressed: {
    opacity: 0.6,
  },
  speedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 6,
  },
  speedText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  time: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
});
