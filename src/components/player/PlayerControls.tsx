import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SEEK_STEP_SECONDS } from '@/components/player/constants';
import { ICONS, type IconName } from '@/components/player/player-icons';
import { SeekBar } from '@/components/player/SeekBar';
import { formatRate } from '@/components/player/SpeedMenu';
import { formatDuration } from '@/utils/format-video';

export interface PlayerControlsProps {
  title?: string | undefined;
  playing: boolean;
  ended: boolean;
  currentTime: number;
  duration: number;
  bufferedPosition: number;
  rate: number;
  fullscreen: boolean;
  /** Live stream: no seeking, skipping or speed changes; a LIVE badge replaces the time. */
  live?: boolean | undefined;
  onTogglePlay: () => void;
  onSkip: (seconds: number) => void;
  onSeek: (seconds: number) => void;
  onScrub: (seconds: number | null) => void;
  onOpenSpeedMenu: () => void;
  onToggleFullscreen: () => void;
  onBack?: (() => void) | undefined;
  /**
   * `overlay` (default): drawn over the video. `panel`: the tabletop half below a foldable's hinge —
   * always the close arrow and the title, no fullscreen toggle (the posture decides the layout).
   */
  variant?: 'overlay' | 'panel';
  /**
   * Replaces the skip / play row between the top and bottom bars (overlay only): the end screen's
   * suggested videos (the player darkens the video behind them).
   */
  center?: React.ReactNode;
}

const DEFAULT_ICON_SIZE = 24;
const PANEL_TITLE_LINES = 2;
/** Padding around the controls when they span the screen (fullscreen / tabletop panel). */
const SCREEN_EDGE_PADDING = 12;

function IconButton({
  icon,
  label,
  size = DEFAULT_ICON_SIZE,
  onPress,
}: Readonly<{
  icon: IconName;
  label: string;
  size?: number;
  onPress: () => void;
}>) {
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

function SpeedButton({ rate, onPress }: Readonly<{ rate: number; onPress: () => void }>) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.speedButton, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Playback speed ${formatRate(rate)}`}
    >
      <SymbolView name={ICONS.speed} size={18} tintColor="#fff" />
      <Text style={styles.speedText}>{`${String(rate)}×`}</Text>
    </Pressable>
  );
}

type ControlsProps = Readonly<PlayerControlsProps>;

/** Fullscreen (overlay): back out of fullscreen. Inline / panel: close the video, when allowed. */
function LeadingButton({
  fullscreen,
  variant,
  onToggleFullscreen,
  onBack,
}: ControlsProps): React.JSX.Element | null {
  if (fullscreen && variant !== 'panel') {
    return <IconButton icon={ICONS.back} label="Back" onPress={onToggleFullscreen} />;
  }
  if (onBack) {
    return <IconButton icon={ICONS.close} label="Close video" onPress={onBack} />;
  }
  return null;
}

/** Back / close, the title (fullscreen / panel only) and the speed button. */
function TopRow(props: ControlsProps) {
  const { title, fullscreen, live, rate, variant, onOpenSpeedMenu } = props;
  const panel = variant === 'panel';
  return (
    <View style={styles.row} pointerEvents="box-none">
      <LeadingButton {...props} />
      <Text style={styles.title} numberOfLines={panel ? PANEL_TITLE_LINES : 1}>
        {fullscreen || panel ? title : ''}
      </Text>
      {live === true ? null : <SpeedButton rate={rate} onPress={onOpenSpeedMenu} />}
    </View>
  );
}

/** The middle button: replay once ended, else pause / play. */
function playButton(ended: boolean, playing: boolean): { icon: IconName; label: string } {
  if (ended) {
    return { icon: ICONS.replay, label: 'Replay' };
  }
  return playing ? { icon: ICONS.pause, label: 'Pause' } : { icon: ICONS.play, label: 'Play' };
}

function SkipButton({
  seconds,
  onSkip,
}: Readonly<{ seconds: number; onSkip: (seconds: number) => void }>) {
  return (
    <IconButton
      icon={seconds < 0 ? ICONS.skipBack : ICONS.skipForward}
      label={`${seconds < 0 ? 'Back' : 'Forward'} ${String(SEEK_STEP_SECONDS)} seconds`}
      size={30}
      onPress={() => {
        onSkip(seconds);
      }}
    />
  );
}

/** Skip back, play/pause/replay, skip forward (live: play/pause only), or `center` instead. */
function CenterRow({ playing, ended, live, onTogglePlay, onSkip, center }: ControlsProps) {
  if (center !== undefined) {
    return <>{center}</>;
  }
  const play = playButton(ended, playing);
  const seekable = live !== true;
  return (
    <View style={styles.center} pointerEvents="box-none">
      {seekable ? <SkipButton seconds={-SEEK_STEP_SECONDS} onSkip={onSkip} /> : null}
      <IconButton icon={play.icon} label={play.label} size={44} onPress={onTogglePlay} />
      {seekable ? <SkipButton seconds={SEEK_STEP_SECONDS} onSkip={onSkip} /> : null}
    </View>
  );
}

/** Time (live: the LIVE badge), fullscreen toggle and the seek bar. */
function BottomRow(props: ControlsProps) {
  const { fullscreen, variant } = props;
  const live = props.live === true;
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
export function PlayerControls(props: ControlsProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const panel = props.variant === 'panel';
  const edges =
    props.fullscreen || panel
      ? {
          paddingLeft: insets.left + SCREEN_EDGE_PADDING,
          paddingRight: insets.right + SCREEN_EDGE_PADDING,
          paddingTop: SCREEN_EDGE_PADDING,
          paddingBottom: Math.max(insets.bottom, SCREEN_EDGE_PADDING),
        }
      : null;

  // The panel reads top to bottom: title, seek bar, then the big buttons nearest the hand.
  return (
    <View
      testID="player-controls"
      style={[panel ? styles.panel : styles.overlay, edges]}
      pointerEvents="box-none"
    >
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
