import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { WIDESCREEN_ASPECT_RATIO } from '@/components/aspect-ratio';
import { useThemeColor } from '@/shared';
import { downloadedThumbnailUri, type DownloadedVideo } from '@/utils/download-library';
import { downloadDetail } from '@/utils/downloads-summary';

interface DownloadRowProps {
  readonly video: DownloadedVideo;
  readonly onPress: (video: DownloadedVideo) => void;
  /** The row's action menu (the "more" button, or a long press). */
  readonly onMore: (video: DownloadedVideo) => void;
}

const MORE_ICON: SymbolViewProps['name'] = {
  ios: 'ellipsis.circle',
  android: 'more_vert',
  web: 'more_vert',
};
const ICON_SIZE = 22;
const HIT_SLOP = 10;
const PLACEHOLDER_COLORS = { light: '#e6e8ea', dark: '#26292b' };

function RowText({ video }: Readonly<{ video: DownloadedVideo }>): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  return (
    <View style={styles.text}>
      <Text style={[styles.title, { color: textColor }]} numberOfLines={2}>
        {video.title}
      </Text>
      {video.channel === undefined ? null : (
        <Text style={[styles.meta, { color: mutedColor }]} numberOfLines={1}>
          {video.channel}
        </Text>
      )}
      <Text style={[styles.meta, { color: mutedColor }]}>{downloadDetail(video)}</Text>
    </View>
  );
}

/** One downloaded video: its saved thumbnail, title, channel, quality and size, plus a menu. */
export function DownloadRow({ video, onPress, onMore }: DownloadRowProps): ReactElement {
  const iconColor = useThemeColor({}, 'icon');
  const placeholderColor = useThemeColor(PLACEHOLDER_COLORS, 'background');
  return (
    <Pressable
      testID={`download-row-${video.postId}`}
      onPress={() => {
        onPress(video);
      }}
      onLongPress={() => {
        onMore(video);
      }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={video.title}
      accessibilityHint="Plays the downloaded video"
    >
      <Image
        testID={`download-thumbnail-${video.postId}`}
        source={downloadedThumbnailUri(video) ?? null}
        style={[styles.thumbnail, { backgroundColor: placeholderColor }]}
        contentFit="cover"
      />
      <RowText video={video} />
      <Pressable
        testID={`download-more-${video.postId}`}
        onPress={() => {
          onMore(video);
        }}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={`More actions for ${video.title}`}
      >
        <SymbolView name={MORE_ICON} size={ICON_SIZE} tintColor={iconColor} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  pressed: {
    opacity: 0.7,
  },
  thumbnail: {
    width: 128,
    aspectRatio: WIDESCREEN_ASPECT_RATIO,
    borderRadius: 8,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    fontSize: 13,
  },
});
