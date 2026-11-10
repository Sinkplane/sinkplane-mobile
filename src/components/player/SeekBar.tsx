import { useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type ViewProps } from 'react-native';

import { SEEK_STEP_SECONDS } from '@/components/player/constants';

interface SeekBarProps {
  currentTime: number;
  duration: number;
  bufferedPosition?: number;
  /** Final position when the finger is lifted (or an accessibility increment/decrement). */
  onSeek: (seconds: number) => void;
  /** Position under the finger while scrubbing, `null` once scrubbing ends. */
  onScrub?: ((seconds: number | null) => void) | undefined;
}

const PERCENT = 100;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** `seconds` as a share of `duration`, as a style width/offset (0% while the duration is unknown). */
const percentOf = (seconds: number, duration: number): `${string}%` =>
  `${String(duration > 0 ? clamp(seconds / duration, 0, 1) * PERCENT : 0)}%`;

/**
 * Responder props for tap/drag seeking: `scrubTime` follows the finger (reported through `onScrub`)
 * and lifting it seeks there.
 */
function useSeekResponder({ duration, onSeek, onScrub }: Readonly<SeekBarProps>) {
  const [width, setWidth] = useState(0);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const scrubTo = (seconds: number | null) => {
    setScrubTime(seconds);
    onScrub?.(seconds);
  };
  const timeAt = (event: GestureResponderEvent) =>
    width > 0 ? clamp(event.nativeEvent.locationX / width, 0, 1) * duration : 0;

  const responder: ViewProps = {
    onLayout: (event) => {
      setWidth(event.nativeEvent.layout.width);
    },
    onStartShouldSetResponder: () => duration > 0,
    onMoveShouldSetResponder: () => duration > 0,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (event) => {
      scrubTo(timeAt(event));
    },
    onResponderMove: (event) => {
      scrubTo(timeAt(event));
    },
    onResponderRelease: (event) => {
      onSeek(timeAt(event));
      scrubTo(null);
    },
    onResponderTerminate: () => {
      scrubTo(null);
    },
  };
  return { scrubTime, responder };
}

function SeekTrack({
  bufferedPosition,
  shown,
  duration,
  scrubbing,
}: Readonly<{ bufferedPosition: number; shown: number; duration: number; scrubbing: boolean }>) {
  return (
    <>
      <View style={styles.track} pointerEvents="none">
        <View
          style={[styles.fill, styles.buffered, { width: percentOf(bufferedPosition, duration) }]}
        />
        <View
          testID="player-seek-progress"
          style={[styles.fill, styles.played, { width: percentOf(shown, duration) }]}
        />
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.thumb,
          scrubbing && styles.thumbActive,
          { left: percentOf(shown, duration) },
        ]}
      />
    </>
  );
}

/** Tap or drag anywhere on the bar to seek. Children ignore touches so `locationX` is bar-relative. */
export function SeekBar({
  currentTime,
  duration,
  bufferedPosition = 0,
  onSeek,
  onScrub,
}: Readonly<SeekBarProps>): React.JSX.Element {
  const { scrubTime, responder } = useSeekResponder({ currentTime, duration, onSeek, onScrub });
  const shown = scrubTime ?? currentTime;
  const seekBy = (delta: number) => {
    onSeek(clamp(currentTime + delta, 0, duration));
  };

  return (
    <View
      testID="player-seek-bar"
      style={styles.hitArea}
      {...responder}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Seek"
      accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(shown) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        seekBy(
          event.nativeEvent.actionName === 'increment' ? SEEK_STEP_SECONDS : -SEEK_STEP_SECONDS,
        );
      }}
    >
      <SeekTrack
        bufferedPosition={bufferedPosition}
        shown={shown}
        duration={duration}
        scrubbing={scrubTime !== null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hitArea: {
    height: 28,
    justifyContent: 'center',
  },
  track: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  buffered: {
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  played: {
    backgroundColor: '#FF0000',
  },
  thumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    marginLeft: -6,
    borderRadius: 6,
    backgroundColor: '#FF0000',
  },
  thumbActive: {
    width: 18,
    height: 18,
    marginLeft: -9,
    borderRadius: 9,
  },
});
