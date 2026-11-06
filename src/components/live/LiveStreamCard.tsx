import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { LiveStatusPill } from '@/components/live/LiveStatusPill';
import type { CreatorLiveStream } from '@/hooks/use-live-streams';
import { useThemeColor } from '@/shared';
import { liveStreamCopy } from '@/utils/live-stream-copy';

interface LiveStreamCardProps {
  stream: CreatorLiveStream;
  /** Opens the live player; only live cards are pressable. */
  onPress?: (stream: CreatorLiveStream) => void;
}

/** One creator's livestream on the Live tab: thumbnail, status, stream title and creator. */
export const LiveStreamCard = memo(function LiveStreamCard({ stream, onPress }: LiveStreamCardProps) {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const placeholderColor = useThemeColor({ light: '#e6e8ea', dark: '#26292b' }, 'background');
  const { creator, status } = stream;
  const live = status === 'live';
  const copy = liveStreamCopy(stream);

  return (
    <Pressable
      testID={`live-stream-${creator.id}`}
      onPress={live && onPress ? () => onPress(stream) : undefined}
      disabled={!live}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      accessibilityRole={live ? 'button' : undefined}
      accessibilityLabel={live ? `Watch ${creator.title} live: ${copy.title}` : undefined}
    >
      <View style={[styles.thumbnail, { backgroundColor: placeholderColor }]}>
        <Image source={copy.thumbnail} style={[StyleSheet.absoluteFill, !live && styles.dimmed]} contentFit="cover" transition={150} />
        <View style={styles.pill}>
          <LiveStatusPill status={status} />
        </View>
      </View>

      <View style={styles.details}>
        {creator.icon?.path ? (
          <Image source={creator.icon.path} style={[styles.creatorIcon, { backgroundColor: placeholderColor }]} />
        ) : null}
        <View style={styles.textColumn}>
          <Text style={[styles.title, { color: textColor }]} numberOfLines={2}>
            {copy.title}
          </Text>
          <Text style={[styles.meta, { color: mutedColor }]} numberOfLines={1}>
            {creator.title}
          </Text>
          {status === 'error' ? (
            <Text style={[styles.meta, { color: mutedColor }]}>Couldn&apos;t check the stream status. Pull to retry.</Text>
          ) : !live && copy.description ? (
            <Text style={[styles.meta, { color: mutedColor }]} numberOfLines={2}>
              {copy.description}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  pressed: {
    opacity: 0.7,
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
  },
  dimmed: {
    opacity: 0.6,
  },
  pill: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  details: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 10,
  },
  creatorIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  meta: {
    fontSize: 13,
  },
});
