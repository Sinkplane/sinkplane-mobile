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
  /** Live stream: no seeking, skipping or speed changes; a LIVE badge replaces the time. */
  live?: boolean;
  onTogglePlay: () => void;
  onSkip: (seconds: number) => void;
  onSeek: (seconds: number) => void;
  onScrub: (seconds: number | null) => void;
  onOpenSpeedMenu: () => void;
  onToggleFullscreen: () => void;
  onBack?: () => void;
  /**
   * `overlay` (default): drawn over the video. `panel`: the tabletop half below a foldable's hinge —
   * always the close arrow and the title, no fullscreen toggle (the posture decides the layout).
   */
  variant?: 'overlay' | 'panel';
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

function LiveBadge() {
  return (
    <View testID="player-live-badge" style={styles.liveBadge}>
      <View style={styles.liveDot} />
      <Text style={styles.liveText}>LIVE</Text>
    </View>
  );
}

function SpeedButton({ rate, onPress }: { rate: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.speedButton, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Playback speed ${formatRate(rate)}`}
    >
      <SymbolView name={ICONS.speed} size={18} tintColor="#fff" />
      <Text style={styles.speedText}>{`${rate}×`}</Text>
    </Pressable>
  );
}

/** Back / close, the title (fullscreen / panel only) and the speed button. */
function TopRow({ title, fullscreen, live, rate, variant, onOpenSpeedMenu, onToggleFullscreen, onBack }: PlayerControlsProps) {
  const panel = variant === 'panel';
  return (
    <View style={styles.row} pointerEvents="box-none">
      {fullscreen && !panel ? (
        <IconButton icon={ICONS.back} label="Back" onPress={onToggleFullscreen} />
      ) : onBack ? (
        <IconButton icon={ICONS.close} label="Close video" onPress={onBack} />
      ) : null}
      <Text style={styles.title} numberOfLines={panel ? 2 : 1}>
        {fullscreen || panel ? title : ''}
      </Text>
      {live ? null : <SpeedButton rate={rate} onPress={onOpenSpeedMenu} />}
    </View>
  );
}

/** Skip back, play/pause/replay, skip forward (live: play/pause only). */
function CenterRow({ playing, ended, live, onTogglePlay, onSkip }: PlayerControlsProps) {
  const playIcon = ended ? ICONS.replay : playing ? ICONS.pause : ICONS.play;
  const playLabel = ended ? 'Replay' : playing ? 'Pause' : 'Play';
  const skipButton = (seconds: number) => (
    <IconButton
      icon={seconds < 0 ? ICONS.skipBack : ICONS.skipForward}
      label={`${seconds < 0 ? 'Back' : 'Forward'} ${SEEK_STEP_SECONDS} seconds`}
      size={30}
      onPress={() => onSkip(seconds)}
    />
  );

  return (
    <View style={styles.center} pointerEvents="box-none">
      {live ? null : skipButton(-SEEK_STEP_SECONDS)}
      <IconButton icon={playIcon} label={playLabel} size={44} onPress={onTogglePlay} />
      {live ? null : skipButton(SEEK_STEP_SECONDS)}
    </View>
  );
}

/** Time (live: the LIVE badge), fullscreen toggle and the seek bar. */
function BottomRow(props: PlayerControlsProps) {
  const { live, fullscreen, variant } = props;
  return (
    <View pointerEvents="box-none">
      <View style={styles.row} pointerEvents="box-none">
        {live ? (
          <View style={styles.time}>
            <LiveBadge />
          </View>
        ) : (
          <Text testID="player-time" style={styles.time}>
            {`${formatDuration(props.currentTime)} / ${formatDuration(props.duration)}`}
          </Text>
        )}
        {variant === 'panel' ? null : (
          <IconButton
            icon={fullscreen ? ICONS.exitFullscreen : ICONS.enterFullscreen}
            label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            size={20}
            onPress={props.onToggleFullscreen}
          />
        )}
      </View>
      {live ? (
        <View style={styles.liveSpacer} />
      ) : (
        <SeekBar
          currentTime={props.currentTime}
          duration={props.duration}
          bufferedPosition={props.bufferedPosition}
          onSeek={props.onSeek}
          onScrub={props.onScrub}
        />
      )}
    </View>
  );
}

/**
 * The on-video control layer: back + speed on top, skip/play in the middle, time, fullscreen and
 * the seek bar at the bottom. Inline, the back button closes the video; in fullscreen it leaves fullscreen.
 * Live streams only get play/pause and fullscreen. Empty areas pass touches through to the gesture surface beneath.
 */
export function PlayerControls(props: PlayerControlsProps) {
  const insets = useSafeAreaInsets();
  const panel = props.variant === 'panel';
  const edges =
    props.fullscreen || panel
      ? { paddingLeft: insets.left + 12, paddingRight: insets.right + 12, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) }
      : null;

  // The panel reads top to bottom: title, seek bar, then the big buttons nearest the hand.
  return (
    <View testID="player-controls" style={[panel ? styles.panel : styles.overlay, edges]} pointerEvents="box-none">
      <TopRow {...props} />
      {panel ? <BottomRow {...props} /> : <CenterRow {...props} />}
      {panel ? <CenterRow {...props} /> : <BottomRow {...props} />}
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
  panel: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-evenly',
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
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#e0001b',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  liveSpacer: {
    height: 8,
  },
  time: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
});
