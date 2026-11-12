import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { VideoView, type VideoPlayer } from 'expo-video';

import { PlaybackError, PlaybackFeedback } from '@/components/player/PlaybackOverlays';
import { PlayerControls, type PlayerControlsProps } from '@/components/player/PlayerControls';
import type { PlaybackState } from '@/components/player/use-playback-state';
import type { SeekFeedback } from '@/components/player/use-seek-feedback';
import type { TabletopLayout } from '@/hooks/use-fold-posture';
import type { usePlayerGestures } from '@/hooks/use-player-gestures';

const LONG_PRESS_MS = 350;

const GESTURE_LABELS = {
  live: 'Live video. Tap to show controls',
  onDemand: 'Video. Tap to show controls, double-tap a side to skip, press and hold for 2× speed',
};

interface PlayerSurfaceProps {
  player: VideoPlayer;
  live: boolean;
  tabletop: TabletopLayout | null;
  gestures: ReturnType<typeof usePlayerGestures>;
  seek: SeekFeedback | null;
  holding: boolean;
  state: PlaybackState;
  onRetry: () => void;
  onPictureInPictureChange: (active: boolean) => void;
  /** `null` while not showing; drawn here only in tabletop (see `EndScreenBackdrop`). */
  endScreen: ReactNode;
}

/** The native video view; reports picture-in-picture starting and stopping. */
function PlayerVideo({
  player,
  onPictureInPictureChange,
}: Readonly<Pick<PlayerSurfaceProps, 'player' | 'onPictureInPictureChange'>>) {
  return (
    <VideoView
      testID="video-view"
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      nativeControls={false}
      allowsPictureInPicture
      startsPictureInPictureAutomatically
      onPictureInPictureStart={() => {
        onPictureInPictureChange(true);
      }}
      onPictureInPictureStop={() => {
        onPictureInPictureChange(false);
      }}
    />
  );
}

/**
 * Darkens the video behind the end screen. In tabletop it also holds the end screen itself (the
 * controls live below the hinge); otherwise the end screen sits in the overlay controls on top.
 */
function EndScreenBackdrop({
  endScreen,
  tabletop,
}: Readonly<Pick<PlayerSurfaceProps, 'endScreen' | 'tabletop'>>): React.JSX.Element | null {
  if (endScreen === null) {
    return null;
  }
  return (
    <View testID="end-screen-backdrop" style={styles.endScreenBackdrop}>
      {tabletop ? endScreen : null}
    </View>
  );
}

/** The video, the touch surface over it and the transient feedback; above the hinge in tabletop. */
export function PlayerSurface({
  player,
  live,
  tabletop,
  gestures,
  seek,
  holding,
  state,
  onRetry,
  onPictureInPictureChange,
  endScreen,
}: Readonly<PlayerSurfaceProps>): React.JSX.Element {
  return (
    <View
      testID="player-video-area"
      style={
        tabletop ? [styles.tabletopVideo, { height: tabletop.hingeTop }] : StyleSheet.absoluteFill
      }
    >
      <PlayerVideo player={player} onPictureInPictureChange={onPictureInPictureChange} />

      <Pressable
        testID="player-gesture-surface"
        style={StyleSheet.absoluteFill}
        delayLongPress={LONG_PRESS_MS}
        onLayout={gestures.onLayout}
        onPress={gestures.onPress}
        onLongPress={gestures.onLongPress}
        onPressOut={gestures.onPressOut}
        accessibilityLabel={GESTURE_LABELS[live ? 'live' : 'onDemand']}
      />

      <PlaybackFeedback seek={seek} holding={holding} loading={state.status === 'loading'} />

      {state.status === 'error' ? (
        <PlaybackError message={state.error?.message} onRetry={onRetry} />
      ) : null}
      <EndScreenBackdrop endScreen={endScreen} tabletop={tabletop} />
    </View>
  );
}

/** The controls over the video, or — in tabletop — on their own panel below the hinge. */
export function ControlsLayer({
  tabletop,
  hidden,
  controlProps,
  endScreen,
}: Readonly<{
  tabletop: TabletopLayout | null;
  hidden: boolean;
  controlProps: PlayerControlsProps;
  /** Takes the middle of the overlay controls, keeping their top and bottom bars. */
  endScreen: ReactNode;
}>): React.JSX.Element | null {
  if (hidden) {
    return null;
  }
  if (!tabletop) {
    return <PlayerControls {...controlProps} center={endScreen ?? undefined} />;
  }
  return (
    <View
      testID="player-tabletop-panel"
      style={[styles.tabletopPanel, { top: tabletop.hingeBottom }]}
    >
      <PlayerControls {...controlProps} variant="panel" />
    </View>
  );
}

const styles = StyleSheet.create({
  tabletopVideo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  endScreenBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  tabletopPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0d0d0d',
  },
});
