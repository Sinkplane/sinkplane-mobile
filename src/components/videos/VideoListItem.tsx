import { memo, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { WIDESCREEN_ASPECT_RATIO } from '@/components/aspect-ratio';
import { imagePath, type ApiImage } from '@/components/image-path';
import { useThemeColor, type Video } from '@/shared';
import { formatCount, formatDuration, formatRelativeDate } from '@/utils/format-video';

interface VideoListItemProps {
  readonly video: Video;
  /** Watched position in seconds. */
  readonly progress?: number | undefined;
  readonly onPress?: ((video: Video) => void) | undefined;
}

/** The embedded channel as the API may send it: some payloads omit it, or its icon. */
type ListChannel = { readonly title?: string; readonly icon?: ApiImage | null } | null | undefined;

const FULL_PERCENT = 100;
const THUMBNAIL_TRANSITION_MS = 150;
const PLACEHOLDER_COLORS = { light: '#e6e8ea', dark: '#26292b' };

/** How much of the video was watched, 0-100. */
function progressPercentOf(progress: number | undefined, duration: number): number {
  if (progress === undefined || progress === 0 || duration === 0) {
    return 0;
  }
  return Math.min((progress / duration) * FULL_PERCENT, FULL_PERCENT);
}

function metaLine(video: Video, channel: ListChannel): string {
  const parts = [
    channel?.title,
    `${formatCount(video.likes)} likes`,
    formatRelativeDate(video.releaseDate),
  ];
  return parts.filter((part) => part !== undefined && part !== '').join(' · ');
}

function channelIconPath(channel: ListChannel): string | undefined {
  return imagePath(channel?.icon);
}

interface ThumbnailProps {
  readonly video: Video;
  readonly progress: number | undefined;
  readonly placeholderColor: string;
}

function ListThumbnail({ video, progress, placeholderColor }: ThumbnailProps): ReactElement {
  const duration = video.metadata.videoDuration;
  const progressPercent = progressPercentOf(progress, duration);
  const thumbnail: ApiImage | null | undefined = video.thumbnail;
  return (
    <View style={[styles.thumbnail, { backgroundColor: placeholderColor }]}>
      <Image
        source={imagePath(thumbnail) ?? null}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={THUMBNAIL_TRANSITION_MS}
        recyclingKey={video.id}
      />
      {duration > 0 ? (
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatDuration(duration)}</Text>
        </View>
      ) : null}
      {progressPercent > 0 ? (
        <View style={styles.progressTrack}>
          <View
            testID={`video-progress-${video.id}`}
            style={[styles.progressBar, { width: `${String(progressPercent)}%` }]}
          />
        </View>
      ) : null}
    </View>
  );
}

function ListDetails({ video, placeholderColor }: Omit<ThumbnailProps, 'progress'>): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const iconPath = channelIconPath(video.channel);
  return (
    <View style={styles.details}>
      {iconPath === undefined ? null : (
        <Image
          source={iconPath}
          style={[styles.channelIcon, { backgroundColor: placeholderColor }]}
        />
      )}
      <View style={styles.textColumn}>
        <Text style={[styles.title, { color: textColor }]} numberOfLines={2}>
          {video.title}
        </Text>
        <Text style={[styles.meta, { color: mutedColor }]} numberOfLines={1}>
          {metaLine(video, video.channel)}
        </Text>
      </View>
    </View>
  );
}

export const VideoListItem = memo(function VideoListItem({
  video,
  progress,
  onPress,
}: VideoListItemProps) {
  const placeholderColor = useThemeColor(PLACEHOLDER_COLORS, 'background');
  const press =
    onPress === undefined
      ? undefined
      : () => {
          onPress(video);
        };

  return (
    <Pressable
      testID={`video-list-item-${video.id}`}
      onPress={press}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={video.title}
    >
      <ListThumbnail video={video} progress={progress} placeholderColor={placeholderColor} />
      <ListDetails video={video} placeholderColor={placeholderColor} />
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
    aspectRatio: WIDESCREEN_ASPECT_RATIO,
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
