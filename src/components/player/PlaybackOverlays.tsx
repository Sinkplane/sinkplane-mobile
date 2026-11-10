import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { HOLD_PLAYBACK_RATE } from '@/components/player/constants';
import type { SeekFeedback } from '@/components/player/use-seek-feedback';

const ERROR_MESSAGE_LINES = 2;

function SeekBubble({ seek }: Readonly<{ seek: SeekFeedback }>) {
  const back = seek.side === 'back';
  return (
    <View
      testID={`seek-feedback-${seek.side}`}
      pointerEvents="none"
      style={[styles.seekFeedback, back ? styles.seekFeedbackLeft : styles.seekFeedbackRight]}
    >
      <Text style={styles.badgeText}>{`${back ? '−' : '+'}${String(seek.seconds)}s`}</Text>
    </View>
  );
}

function HoldBadge() {
  return (
    <View testID="hold-speed-badge" pointerEvents="none" style={styles.holdBadge}>
      <Text style={styles.badgeText}>{`${String(HOLD_PLAYBACK_RATE)}× ▸▸`}</Text>
    </View>
  );
}

/** Transient overlays that never take touches: buffering spinner, seek bubble, 2× badge. */
export function PlaybackFeedback({
  seek,
  holding,
  loading,
}: Readonly<{
  seek: SeekFeedback | null;
  holding: boolean;
  loading: boolean;
}>): React.JSX.Element {
  return (
    <>
      {loading ? (
        <ActivityIndicator
          testID="player-loading"
          pointerEvents="none"
          style={styles.loading}
          color="#fff"
          size="large"
        />
      ) : null}
      {seek ? <SeekBubble seek={seek} /> : null}
      {holding ? <HoldBadge /> : null}
    </>
  );
}

/** Shown when the stream fails to load or play; Retry reloads the same source. */
export function PlaybackError({
  message,
  onRetry,
}: Readonly<{ message?: string | undefined; onRetry: () => void }>): React.JSX.Element {
  return (
    <View testID="player-error" style={styles.errorOverlay}>
      <Text style={styles.badgeText}>Playback failed</Text>
      {message !== undefined && message !== '' ? (
        <Text style={styles.errorMessage} numberOfLines={ERROR_MESSAGE_LINES}>
          {message}
        </Text>
      ) : null}
      <Pressable onPress={onRetry} style={styles.retryButton} accessibilityRole="button">
        <Text style={styles.badgeText}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
