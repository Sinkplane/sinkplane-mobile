import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer, VideoView, type VideoSource } from 'expo-video';

import { CONTROLS_HIDE_MS, HOLD_PLAYBACK_RATE, SEEK_STEP_SECONDS } from '@/components/player/constants';
import { PlayerControls } from '@/components/player/PlayerControls';
import { SpeedMenu } from '@/components/player/SpeedMenu';
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
  onSaveProgress: (seconds: number) => void;
}

const SEEK_FEEDBACK_MS = 600;

interface SeekFeedback {
  side: SeekSide;
  seconds: number;
}

function usePlaybackState(player: ReturnType<typeof useVideoPlayer>) {
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const time = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    bufferedPosition: 0,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const [ended, setEnded] = useState(false);

  useEventListener(player, 'playToEnd', () => setEnded(true));
  useEventListener(player, 'playingChange', ({ isPlaying: nowPlaying }) => {
    if (nowPlaying) setEnded(false);
  });

  return { playing: isPlaying, ended, status, currentTime: time.currentTime, bufferedPosition: time.bufferedPosition };
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
}: VideoPlayerProps) {
  const [initialSource] = useState(source);
  const player = useVideoPlayer(initialSource, p => {
    p.timeUpdateEventInterval = 0.5;
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
  });
  const state = usePlaybackState(player);
  useWatchProgress(player, initialTime, onSaveProgress);

  const [[, storedRate], setStoredRate] = useStorageState<number>('playbackSpeed');
  const rate = storedRate ?? 1;
  const [holding, setHolding] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [inPictureInPicture, setInPictureInPicture] = useState(false);
  const seekFeedback = useSeekFeedback();
  const controls = useControlsVisibility(!state.playing || scrubTime !== null || speedMenuOpen);

  useEffect(() => {
    if (!holding) player.playbackRate = rate;
  }, [player, rate, holding]);

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
      seekTo(player.currentTime + (side === 'back' ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS));
      seekFeedback.show(side);
    },
    onHoldStart: () => {
      if (!player.playing) return;
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

  const showControls = controls.visible && !holding && !inPictureInPicture;

  return (
    <View testID="video-player" style={fullscreen ? styles.fullscreen : styles.inline}>
      <VideoView
        testID="video-view"
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
        allowsPictureInPicture
        startsPictureInPictureAutomatically
        onPictureInPictureStart={() => setInPictureInPicture(true)}
        onPictureInPictureStop={() => setInPictureInPicture(false)}
      />

      <Pressable
        testID="player-gesture-surface"
        style={StyleSheet.absoluteFill}
        delayLongPress={350}
        onLayout={gestures.onLayout}
        onPress={gestures.onPress}
        onLongPress={gestures.onLongPress}
        onPressOut={gestures.onPressOut}
        accessibilityLabel="Video. Tap to show controls, double-tap a side to skip, press and hold for 2× speed"
      />

      <PlaybackFeedback seek={seekFeedback.feedback} holding={holding} loading={state.status === 'loading'} />

      {showControls ? (
        <PlayerControls
          title={title}
          playing={state.playing}
          ended={state.ended}
          currentTime={scrubTime ?? state.currentTime}
          duration={duration}
          bufferedPosition={state.bufferedPosition}
          rate={rate}
          fullscreen={fullscreen}
          onTogglePlay={togglePlay}
          onSkip={skip}
          onSeek={seekTo}
          onScrub={setScrubTime}
          onOpenSpeedMenu={() => setSpeedMenuOpen(true)}
          onToggleFullscreen={() => {
            onFullscreenChange(!fullscreen);
            controls.touch();
          }}
          onBack={onBack}
        />
      ) : null}

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
