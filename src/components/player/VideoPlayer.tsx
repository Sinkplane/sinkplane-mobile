import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { VideoPlayer as NativeVideoPlayer, VideoSource } from 'expo-video';
import { SpaceKeyListener } from '@modules/hardware-keys';

import { SEEK_STEP_SECONDS } from '@/components/player/constants';
import { useSessionPlayer, type PlaybackMedia } from '@/components/player/PlaybackSession';
import type { PlayerControlsProps } from '@/components/player/PlayerControls';
import { applyPlayerSettings } from '@/components/player/player-settings';
import { ControlsLayer, PlayerSurface } from '@/components/player/PlayerSurface';
import { SpeedMenu } from '@/components/player/SpeedMenu';
import { useEndScreen, type EndScreenRenderer } from '@/components/player/use-end-screen';
import {
  useControlsVisibility,
  type ControlsVisibility,
} from '@/components/player/use-controls-visibility';
import { usePlaybackErrors } from '@/components/player/use-playback-errors';
import { usePlaybackSpeed, type PlaybackSpeed } from '@/components/player/use-playback-speed';
import { usePlaybackState, type PlaybackState } from '@/components/player/use-playback-state';
import { useSeekFeedback } from '@/components/player/use-seek-feedback';
import type { TabletopLayout } from '@/hooks/use-fold-posture';
import { usePlayerGestures, type SeekSide } from '@/hooks/use-player-gestures';
import { useWatchProgress } from '@/hooks/use-watch-progress';

const TIME_UPDATE_INTERVAL_SECONDS = 0.5;
const ASPECT_WIDTH = 16;
const ASPECT_HEIGHT = 9;

interface VideoPlayerProps {
  /** Read once at mount: later changes (refetched stream URL, refreshed token) would restart playback. */
  source: VideoSource;
  title?: string | undefined;
  /** Position to resume from, in seconds. */
  initialTime?: number | undefined;
  /** Used until the stream reports its own duration. */
  fallbackDuration?: number | undefined;
  fullscreen: boolean;
  onFullscreenChange: (fullscreen: boolean) => void;
  onBack?: (() => void) | undefined;
  /** Called with the watch position (seconds) to persist it. */
  onSaveProgress?: ((seconds: number) => void) | undefined;
  /**
   * Live stream: no seeking (skip buttons, double-tap, seek bar), no speed changes (menu, hold
   * for 2×) and no saved progress; the controls show a LIVE badge instead of the time.
   */
  live?: boolean | undefined;
  /** Called with the native error message whenever the stream fails to load or play. */
  onError?: ((message: string | undefined) => void) | undefined;
  /** Replaces the error overlay's default Retry (reloading the original source). */
  onRetry?: (() => void) | undefined;
  /**
   * Plays through the app's playback session (see `PlaybackSession`), so the mini player can take
   * over when the page closes, and reopening the same media resumes that player seamlessly.
   */
  media?: PlaybackMedia | undefined;
  /**
   * Foldable in tabletop posture: the video fills the screen above the hinge and the controls
   * stay up on the screen below it (YouTube's "flex mode"). The player takes the whole screen.
   */
  tabletop?: TabletopLayout | null | undefined;
  /**
   * Shown when an on-demand video plays to the end (suggested videos): in the middle of the
   * controls, in place of skip / replay, keeping their top and bottom bars.
   */
  endScreen?: EndScreenRenderer | undefined;
}

type Props = Readonly<VideoPlayerProps>;

function setUpPlayer(player: NativeVideoPlayer): void {
  applyPlayerSettings(player, {
    timeUpdateEventInterval: TIME_UPDATE_INTERVAL_SECONDS,
    staysActiveInBackground: true,
    showNowPlayingNotification: true,
  });
}

/** The resume position travels with the session, for a view that takes over a not-yet-started player. */
function sessionMediaFor({ media, live, initialTime }: Props): PlaybackMedia | undefined {
  return media ? { ...media, resumeAt: live === true ? undefined : initialTime } : undefined;
}

/**
 * The native player (from the playback session), its state, saved progress (live streams
 * autoplay without resuming a saved position or reporting watch progress) and error handling.
 */
function usePlayback(props: Props) {
  const [initialSource] = useState(props.source);
  const [sessionMedia] = useState(() => sessionMediaFor(props));
  const { player, isCurrent } = useSessionPlayer(initialSource, setUpPlayer, sessionMedia);
  const state = usePlaybackState(player);
  const live = props.live === true;
  useWatchProgress(player, {
    initialTime: live ? undefined : props.initialTime,
    save: live ? undefined : props.onSaveProgress,
    canAutoplay: isCurrent,
  });
  const retry = usePlaybackErrors(player, initialSource, { ...props, state });
  const duration = player.duration > 0 ? player.duration : (props.fallbackDuration ?? 0);
  return { player, state, retry, duration };
}

/** Seek (clamped to the duration once known), skip and play/pause/replay. */
function playerActions(
  player: NativeVideoPlayer,
  { duration, ended }: Readonly<{ duration: number; ended: boolean }>,
  controls: ControlsVisibility,
) {
  const seekTo = (seconds: number) => {
    applyPlayerSettings(player, {
      currentTime: Math.min(Math.max(seconds, 0), duration > 0 ? duration : seconds),
    });
  };
  const togglePlay = () => {
    if (ended) {
      player.replay();
    } else if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
    controls.touch();
  };
  const skip = (seconds: number) => {
    seekTo(player.currentTime + seconds);
    controls.touch();
  };
  return { seekTo, togglePlay, skip };
}

interface ControlState {
  props: Props;
  state: PlaybackState;
  speed: PlaybackSpeed;
  duration: number;
  scrubTime: number | null;
  setScrubTime: (seconds: number | null) => void;
  controls: ControlsVisibility;
  actions: ReturnType<typeof playerActions>;
}

function controlPropsFor({
  props,
  state,
  speed,
  duration,
  scrubTime,
  setScrubTime,
  controls,
  actions,
}: Readonly<ControlState>): PlayerControlsProps {
  return {
    title: props.title,
    playing: state.playing,
    ended: state.ended,
    currentTime: scrubTime ?? state.currentTime,
    duration,
    bufferedPosition: state.bufferedPosition,
    rate: speed.rate,
    fullscreen: props.fullscreen,
    live: props.live,
    onTogglePlay: actions.togglePlay,
    onSkip: actions.skip,
    onSeek: actions.seekTo,
    onScrub: setScrubTime,
    onOpenSpeedMenu: speed.openMenu,
    onToggleFullscreen: () => {
      props.onFullscreenChange(!props.fullscreen);
      controls.touch();
    },
    onBack: props.onBack,
  };
}

/** Errors, picture-in-picture and (unless the controls have their own tabletop panel) idling / holding. */
function controlsHidden(
  {
    status,
    controls,
    holding,
  }: Readonly<{ status: string; controls: ControlsVisibility; holding: boolean }>,
  inPictureInPicture: boolean,
  tabletop: TabletopLayout | null,
): boolean {
  return status === 'error' || inPictureInPicture || (!tabletop && (!controls.visible || holding));
}

/** Double-tapping a side skips back / forward (not live) and shows the accumulating bubble. */
function useDoubleTapSkip(
  player: NativeVideoPlayer,
  live: boolean,
  seekTo: (seconds: number) => void,
) {
  const seekFeedback = useSeekFeedback();
  const onDoubleTap = (side: SeekSide) => {
    if (live) {
      return;
    }
    seekTo(player.currentTime + (side === 'back' ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS));
    seekFeedback.show(side);
  };
  return { seek: seekFeedback.feedback, onDoubleTap };
}

/** Everything the player view renders, wired to the native player. */
function useVideoPlayer(props: Props) {
  const live = props.live === true;
  const tabletop = props.tabletop ?? null;
  const { player, state, retry, duration } = usePlayback(props);
  const speed = usePlaybackSpeed(player, live);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [inPictureInPicture, setInPictureInPicture] = useState(false);
  // Tabletop: the controls live on their own half of the screen, so they never hide.
  const controls = useControlsVisibility(
    !state.playing || scrubTime !== null || speed.menuOpen || tabletop !== null,
  );
  const actions = playerActions(player, { duration, ended: state.ended }, controls);
  const { seek, onDoubleTap } = useDoubleTapSkip(player, live, actions.seekTo);
  const gestures = usePlayerGestures({
    onSingleTap: controls.toggle,
    onDoubleTap,
    onHoldStart: speed.startHold,
    onHoldEnd: speed.endHold,
  });
  const controlProps = controlPropsFor({
    props,
    state,
    speed,
    duration,
    scrubTime,
    setScrubTime,
    controls,
    actions,
  });
  const hidden = controlsHidden(
    { status: state.status, controls, holding: speed.holding },
    inPictureInPicture,
    tabletop,
  );
  const endScreen = useEndScreen(props.endScreen, live || inPictureInPicture, { state, actions });
  const surface = { player, live, tabletop, gestures, seek, state, onRetry: retry, endScreen };
  return { speed, tabletop, surface, controlProps, hidden, setInPictureInPicture };
}

/**
 * Floatplane video player with custom touch controls: tap to show/hide the controls, double-tap
 * the left/right half to skip back/forward, press and hold for 2× speed. Picture-in-picture starts
 * automatically when the app is backgrounded during playback.
 */
export function VideoPlayer(props: Props): React.JSX.Element {
  const { speed, tabletop, surface, controlProps, hidden, setInPictureInPicture } =
    useVideoPlayer(props);

  return (
    <View
      testID="video-player"
      style={props.fullscreen || tabletop ? styles.fullscreen : styles.inline}
    >
      <PlayerSurface
        {...surface}
        holding={speed.holding}
        onPictureInPictureChange={setInPictureInPicture}
      />

      {/* Hardware keyboard (iPad, Android): space plays / pauses, like the center button. */}
      <SpaceKeyListener onSpace={controlProps.onTogglePlay} active={!speed.menuOpen} />

      <ControlsLayer
        tabletop={tabletop}
        hidden={hidden}
        controlProps={controlProps}
        endScreen={surface.endScreen}
      />

      <SpeedMenu
        visible={speed.menuOpen}
        rate={speed.rate}
        onSelect={speed.selectSpeed}
        onClose={speed.closeMenu}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  inline: {
    width: '100%',
    aspectRatio: ASPECT_WIDTH / ASPECT_HEIGHT,
    backgroundColor: '#000',
  },
  // A separate style rather than an override: `aspectRatio: undefined` doesn't cancel the inline one.
  fullscreen: {
    flex: 1,
    backgroundColor: '#000',
  },
});
