import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEvent, useEventListener } from 'expo';
import { VideoView, type VideoPlayer as NativeVideoPlayer, type VideoSource } from 'expo-video';

import { CONTROLS_HIDE_MS, HOLD_PLAYBACK_RATE, SEEK_STEP_SECONDS } from '@/components/player/constants';
import { useSessionPlayer, type PlaybackMedia } from '@/components/player/PlaybackSession';
import { PlayerControls, type PlayerControlsProps } from '@/components/player/PlayerControls';
import { SpeedMenu } from '@/components/player/SpeedMenu';
import type { TabletopLayout } from '@/hooks/use-fold-posture';
import { usePlayerGestures, type SeekSide } from '@/hooks/use-player-gestures';
import { useWatchProgress } from '@/hooks/use-watch-progress';
import { useStorageState } from '@/shared';

export interface VideoPlayerProps {
  /** Read once at mount: later changes (refetched stream URL, refreshed token) would restart playback. */
  source: VideoSource;
  title?: string;
  /** Position to resume from, in seconds. */
  initialTime?: number;
  /** Used until the stream reports its own duration. */
  fallbackDuration?: number;
  fullscreen: boolean;
  onFullscreenChange: (fullscreen: boolean) => void;
  onBack?: () => void;
  /** Called with the watch position (seconds) to persist it. */
  onSaveProgress?: (seconds: number) => void;
  /**
   * Live stream: no seeking (skip buttons, double-tap, seek bar), no speed changes (menu, hold
   * for 2×) and no saved progress; the controls show a LIVE badge instead of the time.
   */
  live?: boolean;
  /** Called with the native error message whenever the stream fails to load or play. */
  onError?: (message: string | undefined) => void;
  /** Replaces the error overlay's default Retry (reloading the original source). */
  onRetry?: () => void;
  /**
   * Plays through the app's playback session (see `PlaybackSession`), so the mini player can take
   * over when the page closes, and reopening the same media resumes that player seamlessly.
   */
  media?: PlaybackMedia;
  /**
   * Foldable in tabletop posture: the video fills the screen above the hinge and the controls
   * stay up on the screen below it (YouTube's "flex mode"). The player takes the whole screen.
   */
  tabletop?: TabletopLayout | null;
}

const GESTURE_LABELS = {
  live: 'Live video. Tap to show controls',
  onDemand: 'Video. Tap to show controls, double-tap a side to skip, press and hold for 2× speed',
};

const SEEK_FEEDBACK_MS = 600;

interface SeekFeedback {
  side: SeekSide;
  seconds: number;
}

function usePlaybackState(player: NativeVideoPlayer) {
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const time = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    bufferedPosition: 0,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
  });
  const { status, error } = useEvent(player, 'statusChange', { status: player.status, error: undefined });
  const [ended, setEnded] = useState(false);

  useEventListener(player, 'playToEnd', () => setEnded(true));
  useEventListener(player, 'playingChange', ({ isPlaying: nowPlaying }) => {
    if (nowPlaying) setEnded(false);
  });

  return { playing: isPlaying, ended, status, error, currentTime: time.currentTime, bufferedPosition: time.bufferedPosition };
}

/**
 * The playback speed picked in the speed menu (persisted across videos), applied to the player
 * unless a press-and-hold boost is active. Live streams always play at 1×.
 */
function usePlaybackRate(player: NativeVideoPlayer, live: boolean, holding: boolean) {
  const [[, storedRate], setStoredRate] = useStorageState<number>('playbackSpeed');
  const rate = live ? 1 : (storedRate ?? 1);

  useEffect(() => {
    if (!holding) player.playbackRate = rate;
  }, [player, rate, holding]);

  return [rate, setStoredRate] as const;
}

/**
 * Live streams autoplay without resuming a saved position or reporting watch progress. A player
 * taken over from the mini player (`reused`) keeps its position and play state.
 */
function usePlaybackProgress(
  player: NativeVideoPlayer,
  reused: boolean,
  { live, initialTime, onSaveProgress }: Pick<VideoPlayerProps, 'live' | 'initialTime' | 'onSaveProgress'>,
) {
  useWatchProgress(player, live || reused ? undefined : initialTime, live ? undefined : onSaveProgress, reused);
}

function setUpPlayer(player: NativeVideoPlayer) {
  player.timeUpdateEventInterval = 0.5;
  player.staysActiveInBackground = true;
  player.showNowPlayingNotification = true;
}

/** Controls stay up while paused/ended/scrubbing, and hide after a few idle seconds while playing. */
function useControlsVisibility(keepVisible: boolean) {
  const [visible, setVisible] = useState(true);
  const [activity, setActivity] = useState(0);

  useEffect(() => {
    if (!visible || keepVisible) return;
    const timer = setTimeout(() => setVisible(false), CONTROLS_HIDE_MS);
    return () => clearTimeout(timer);
  }, [visible, keepVisible, activity]);

  return {
    visible: visible || keepVisible,
    toggle: () => setVisible(v => !v),
    /** Any interaction with the controls restarts the hide timer. */
    touch: () => {
      setVisible(true);
      setActivity(a => a + 1);
    },
  };
}

/** The "−15s" / "+15s" bubble after a double tap; repeated double taps accumulate, like YouTube. */
function useSeekFeedback() {
  const [feedback, setFeedback] = useState<SeekFeedback | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const show = (side: SeekSide) => {
    setFeedback(current => ({ side, seconds: (current?.side === side ? current.seconds : 0) + SEEK_STEP_SECONDS }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFeedback(null), SEEK_FEEDBACK_MS);
  };

  return { feedback, show };
}

/** Transient overlays that never take touches: buffering spinner, seek bubble, 2× badge. */
function PlaybackFeedback({ seek, holding, loading }: { seek: SeekFeedback | null; holding: boolean; loading: boolean }) {
  return (
    <>
      {loading ? <ActivityIndicator testID="player-loading" pointerEvents="none" style={styles.loading} color="#fff" size="large" /> : null}
      {seek ? (
        <View
          testID={`seek-feedback-${seek.side}`}
          pointerEvents="none"
          style={[styles.seekFeedback, seek.side === 'back' ? styles.seekFeedbackLeft : styles.seekFeedbackRight]}
        >
          <Text style={styles.badgeText}>{`${seek.side === 'back' ? '−' : '+'}${seek.seconds}s`}</Text>
        </View>
      ) : null}
      {holding ? (
        <View testID="hold-speed-badge" pointerEvents="none" style={styles.holdBadge}>
          <Text style={styles.badgeText}>{`${HOLD_PLAYBACK_RATE}× ▸▸`}</Text>
        </View>
      ) : null}
    </>
  );
}

/**
 * Reacts to playback errors: leaves fullscreen (the error overlay replaces the controls, incl. the
 * exit-fullscreen button, so don't strand the user there) and reports the error. Returns the
 * overlay's Retry action: `onRetry`, or else reloading the original source.
 */
function usePlaybackErrors(
  player: NativeVideoPlayer,
  initialSource: VideoSource,
  { status, error }: ReturnType<typeof usePlaybackState>,
  { fullscreen, onFullscreenChange, onError, onRetry }: Pick<VideoPlayerProps, 'fullscreen' | 'onFullscreenChange' | 'onError' | 'onRetry'>,
) {
  useEffect(() => {
    if (status === 'error' && fullscreen) onFullscreenChange(false);
  }, [status, fullscreen, onFullscreenChange]);

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const message = error?.message;
  useEffect(() => {
    if (status === 'error') onErrorRef.current?.(message);
  }, [status, message]);

  return (
    onRetry ??
    (() => {
      player
        .replaceAsync(initialSource)
        .then(() => player.play())
        .catch(() => {});
    })
  );
}

/** Shown when the stream fails to load or play; Retry reloads the same source. */
function PlaybackError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <View testID="player-error" style={styles.errorOverlay}>
      <Text style={styles.badgeText}>Playback failed</Text>
      {message ? (
        <Text style={styles.errorMessage} numberOfLines={2}>
          {message}
        </Text>
      ) : null}
      <Pressable onPress={onRetry} style={styles.retryButton} accessibilityRole="button">
        <Text style={styles.badgeText}>Retry</Text>
      </Pressable>
    </View>
  );
}

/**
 * Floatplane video player with custom touch controls: tap to show/hide the controls, double-tap
 * the left/right half to skip back/forward, press and hold for 2× speed. Picture-in-picture starts
 * automatically when the app is backgrounded during playback.
 */
export function VideoPlayer({
  source,
  title,
  initialTime,
  fallbackDuration = 0,
  fullscreen,
  onFullscreenChange,
  onBack,
  onSaveProgress,
  live,
  onError,
  onRetry,
  media,
  tabletop,
}: VideoPlayerProps) {
  const [initialSource] = useState(source);
  const { player, reused } = useSessionPlayer(initialSource, setUpPlayer, media);
  const state = usePlaybackState(player);
  usePlaybackProgress(player, reused, { live, initialTime, onSaveProgress });

  const [holding, setHolding] = useState(false);
  const [rate, setStoredRate] = usePlaybackRate(player, !!live, holding);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [inPictureInPicture, setInPictureInPicture] = useState(false);
  const seekFeedback = useSeekFeedback();
  // Tabletop: the controls live on their own half of the screen, so they never hide.
  const controls = useControlsVisibility(!state.playing || scrubTime !== null || speedMenuOpen || !!tabletop);

  const retry = usePlaybackErrors(player, initialSource, state, { fullscreen, onFullscreenChange, onError, onRetry });

  const duration = player.duration > 0 ? player.duration : fallbackDuration;

  const seekTo = (seconds: number) => {
    player.currentTime = Math.min(Math.max(seconds, 0), duration || seconds);
  };

  const skip = (seconds: number) => {
    seekTo(player.currentTime + seconds);
    controls.touch();
  };

  const gestures = usePlayerGestures({
    onSingleTap: controls.toggle,
    onDoubleTap: side => {
      if (live) return;
      seekTo(player.currentTime + (side === 'back' ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS));
      seekFeedback.show(side);
    },
    onHoldStart: () => {
      if (live || !player.playing) return;
      setHolding(true);
      player.playbackRate = HOLD_PLAYBACK_RATE;
    },
    onHoldEnd: () => {
      setHolding(false);
      player.playbackRate = rate;
    },
  });

  const togglePlay = () => {
    if (state.ended) player.replay();
    else if (player.playing) player.pause();
    else player.play();
    controls.touch();
  };

  const controlProps: PlayerControlsProps = {
    title,
    playing: state.playing,
    ended: state.ended,
    currentTime: scrubTime ?? state.currentTime,
    duration,
    bufferedPosition: state.bufferedPosition,
    rate,
    fullscreen,
    live,
    onTogglePlay: togglePlay,
    onSkip: skip,
    onSeek: seekTo,
    onScrub: setScrubTime,
    onOpenSpeedMenu: () => setSpeedMenuOpen(true),
    onToggleFullscreen: () => {
      onFullscreenChange(!fullscreen);
      controls.touch();
    },
    onBack,
  };

  return (
    <View testID="video-player" style={fullscreen || tabletop ? styles.fullscreen : styles.inline}>
      <PlayerSurface
        player={player}
        live={live}
        tabletop={tabletop}
        gestures={gestures}
        seek={seekFeedback.feedback}
        holding={holding}
        state={state}
        onRetry={retry}
        onPictureInPictureChange={setInPictureInPicture}
      />

      <ControlsLayer
        tabletop={tabletop}
        hidden={state.status === 'error' || inPictureInPicture || (!tabletop && (!controls.visible || holding))}
        controlProps={controlProps}
      />

      <SpeedMenu
        visible={speedMenuOpen}
        rate={rate}
        onSelect={speed => {
          setStoredRate(speed);
          setSpeedMenuOpen(false);
        }}
        onClose={() => setSpeedMenuOpen(false)}
      />
    </View>
  );
}

interface PlayerSurfaceProps {
  player: NativeVideoPlayer;
  live?: boolean;
  tabletop?: TabletopLayout | null;
  gestures: ReturnType<typeof usePlayerGestures>;
  seek: SeekFeedback | null;
  holding: boolean;
  state: ReturnType<typeof usePlaybackState>;
  onRetry: () => void;
  onPictureInPictureChange: (active: boolean) => void;
}

/** The video, the touch surface over it and the transient feedback; above the hinge in tabletop. */
function PlayerSurface({ player, live, tabletop, gestures, seek, holding, state, onRetry, onPictureInPictureChange }: PlayerSurfaceProps) {
  return (
    <View testID="player-video-area" style={tabletop ? [styles.tabletopVideo, { height: tabletop.hingeTop }] : StyleSheet.absoluteFill}>
      <VideoView
        testID="video-view"
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
        allowsPictureInPicture
        startsPictureInPictureAutomatically
        onPictureInPictureStart={() => onPictureInPictureChange(true)}
        onPictureInPictureStop={() => onPictureInPictureChange(false)}
      />

      <Pressable
        testID="player-gesture-surface"
        style={StyleSheet.absoluteFill}
        delayLongPress={350}
        onLayout={gestures.onLayout}
        onPress={gestures.onPress}
        onLongPress={gestures.onLongPress}
        onPressOut={gestures.onPressOut}
        accessibilityLabel={GESTURE_LABELS[live ? 'live' : 'onDemand']}
      />

      <PlaybackFeedback seek={seek} holding={holding} loading={state.status === 'loading'} />

      {state.status === 'error' ? <PlaybackError message={state.error?.message} onRetry={onRetry} /> : null}
    </View>
  );
}

/** The controls over the video, or — in tabletop — on their own panel below the hinge. */
function ControlsLayer({
  tabletop,
  hidden,
  controlProps,
}: {
  tabletop?: TabletopLayout | null;
  hidden: boolean;
  controlProps: PlayerControlsProps;
}) {
  if (hidden) return null;
  if (!tabletop) return <PlayerControls {...controlProps} />;
  return (
    <View testID="player-tabletop-panel" style={[styles.tabletopPanel, { top: tabletop.hingeBottom }]}>
      <PlayerControls {...controlProps} variant="panel" />
    </View>
  );
}

const styles = StyleSheet.create({
  inline: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  // A separate style rather than an override: `aspectRatio: undefined` doesn't cancel the inline one.
  fullscreen: {
    flex: 1,
    backgroundColor: '#000',
  },
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
  seekFeedback: {
    position: 'absolute',
    top: '40%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  seekFeedbackLeft: {
    left: '12%',
  },
  seekFeedbackRight: {
    right: '12%',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
    backgroundColor: '#000',
  },
  errorMessage: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  loading: {
    ...StyleSheet.absoluteFill,
  },
  holdBadge: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  badgeText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
