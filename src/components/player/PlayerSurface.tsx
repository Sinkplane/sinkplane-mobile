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
    </View>
  );
}

/** The controls over the video, or — in tabletop — on their own panel below the hinge. */
export function ControlsLayer({
  tabletop,
  hidden,
  controlProps,
}: Readonly<{
  tabletop: TabletopLayout | null;
  hidden: boolean;
  controlProps: PlayerControlsProps;
}>): React.JSX.Element | null {
  if (hidden) {
    return null;
  }
  if (!tabletop) {
    return <PlayerControls {...controlProps} />;
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
  tabletopPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0d0d0d',
  },
});
