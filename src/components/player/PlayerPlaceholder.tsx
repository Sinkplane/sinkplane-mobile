import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

interface PlayerPlaceholderProps {
  /** Shown instead of the spinner (an error or "not live" notice). */
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

/** The black 16:9 slot shown where the player goes while loading, or when there is nothing to play. */
export function PlayerPlaceholder({ message, onRetry, retryLabel = 'Retry' }: PlayerPlaceholderProps) {
  return (
    <View testID="player-placeholder" style={styles.placeholder}>
      {message ? <Text style={styles.placeholderText}>{message}</Text> : <ActivityIndicator color="#fff" />}
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.retryButton} accessibilityRole="button">
          <Text style={styles.retryText}>{retryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    backgroundColor: '#000',
  },
  placeholderText: {
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
});
