import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { LiveStatusPill } from '@/components/live/LiveStatusPill';
import type { CreatorLiveStream } from '@/hooks/use-live-streams';
import { useThemeColor } from '@/shared';
import { liveStreamCopy } from '@/utils/live-stream-copy';

/** Status, stream title, creator and description shown below the live player. */
export function LiveDetails({ stream }: { stream: CreatorLiveStream }) {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const placeholderColor = useThemeColor({ light: '#e6e8ea', dark: '#26292b' }, 'background');
  const { creator } = stream;
  const copy = liveStreamCopy(stream);

  return (
    <View style={styles.container}>
      <LiveStatusPill status={stream.status} />
      <Text testID="live-title" style={[styles.title, { color: textColor }]}>
        {copy.title}
      </Text>

      <View style={styles.creatorRow}>
        <View style={[styles.creatorIcon, { backgroundColor: placeholderColor }]}>
          {creator.icon?.path ? <Image source={creator.icon.path} style={StyleSheet.absoluteFill} /> : null}
        </View>
        <Text style={[styles.creatorName, { color: textColor }]} numberOfLines={1}>
          {creator.title}
        </Text>
      </View>

      {copy.description ? (
        <Text testID="live-description" style={[styles.description, { color: mutedColor }]}>
          {copy.description}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    gap: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  creatorIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  creatorName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
});
