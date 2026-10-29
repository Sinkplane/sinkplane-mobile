import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { useThemeColor, type Video } from '@/shared';
import { formatCount, formatDuration, formatRelativeDate } from '@/utils/format-video';

interface VideoListItemProps {
  video: Video;
  /** Watched position in seconds. */
  progress?: number;
  onPress?: (video: Video) => void;
}

export const VideoListItem = memo(function VideoListItem({ video, progress, onPress }: VideoListItemProps) {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const placeholderColor = useThemeColor({ light: '#e6e8ea', dark: '#26292b' }, 'background');

  const duration = video.metadata.videoDuration;
  const progressPercent = progress && duration ? Math.min((progress / duration) * 100, 100) : 0;
  const meta = [video.channel?.title, `${formatCount(video.likes)} likes`, formatRelativeDate(video.releaseDate)].filter(Boolean);

  return (
    <Pressable
      testID={`video-list-item-${video.id}`}
      onPress={onPress ? () => onPress(video) : undefined}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={video.title}
    >
      <View style={[styles.thumbnail, { backgroundColor: placeholderColor }]}>
        <Image source={video.thumbnail?.path} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} recyclingKey={video.id} />
        {duration > 0 ? (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(duration)}</Text>
          </View>
        ) : null}
        {progressPercent > 0 ? (
          <View style={styles.progressTrack}>
            <View testID={`video-progress-${video.id}`} style={[styles.progressBar, { width: `${progressPercent}%` }]} />
          </View>
        ) : null}
      </View>

      <View style={styles.details}>
        {video.channel?.icon?.path ? (
          <Image source={video.channel.icon.path} style={[styles.channelIcon, { backgroundColor: placeholderColor }]} />
        ) : null}
        <View style={styles.textColumn}>
          <Text style={[styles.title, { color: textColor }]} numberOfLines={2}>
            {video.title}
          </Text>
          <Text style={[styles.meta, { color: mutedColor }]} numberOfLines={1}>
            {meta.join(' · ')}
          </Text>
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
  durationBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#FF0000',
  },
  details: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 12,
  },
  channelIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  textColumn: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 21,
  },
  meta: {
    fontSize: 13,
    marginTop: 3,
  },
});
