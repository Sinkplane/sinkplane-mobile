import { useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { WIDESCREEN_ASPECT_RATIO } from '@/components/aspect-ratio';
import { DESTRUCTIVE_COLOR } from '@/components/downloads/DownloadActionSheet';
import {
  confirmDeleteAllDownloads,
  confirmDeleteDownload,
} from '@/components/downloads/download-menus';
import { useDownloadedVideos } from '@/hooks/use-video-download';
import { useThemeColor } from '@/shared';
import { downloadedThumbnailUri, type DownloadedVideo } from '@/utils/download-library';
import { downloadDetail } from '@/utils/downloads-summary';

const TRASH_ICON: SymbolViewProps['name'] = { ios: 'trash', android: 'delete', web: 'delete' };
const ICON_SIZE = 20;
const HIT_SLOP = 10;
const PLACEHOLDER_COLORS = { light: '#e6e8ea', dark: '#26292b' };
const noop = (): void => undefined;

/** One downloaded video with a delete button (asks first). */
function DownloadedVideoItem({ video }: Readonly<{ video: DownloadedVideo }>): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const placeholderColor = useThemeColor(PLACEHOLDER_COLORS, 'background');
  return (
    <View testID={`settings-download-${video.postId}`} style={styles.item}>
      <Image
        source={downloadedThumbnailUri(video) ?? null}
        style={[styles.thumbnail, { backgroundColor: placeholderColor }]}
        contentFit="cover"
      />
      <View style={styles.itemText}>
        <Text style={[styles.itemTitle, { color: textColor }]} numberOfLines={2}>
          {video.title}
        </Text>
        <Text style={[styles.meta, { color: mutedColor }]}>{downloadDetail(video)}</Text>
      </View>
      <Pressable
        testID={`settings-delete-download-${video.postId}`}
        onPress={() => {
          confirmDeleteDownload(video, noop);
        }}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${video.title}`}
      >
        <SymbolView name={TRASH_ICON} size={ICON_SIZE} tintColor={DESTRUCTIVE_COLOR} />
      </Pressable>
    </View>
  );
}

function VideoItems({ videos }: Readonly<{ videos: readonly DownloadedVideo[] }>): ReactElement {
  return (
    <View testID="settings-downloaded-list" style={styles.items}>
      {videos.map((video) => (
        <DownloadedVideoItem key={video.postId} video={video} />
      ))}
      <Pressable
        testID="settings-delete-all-downloads"
        onPress={() => {
          confirmDeleteAllDownloads(videos);
        }}
        accessibilityRole="button"
        style={styles.deleteAll}
      >
        <Text style={[styles.deleteAllText, { color: DESTRUCTIVE_COLOR }]}>Delete all</Text>
      </Pressable>
    </View>
  );
}

/**
 * Settings › Downloads: a "Show downloaded videos" switch that lists every download right here,
 * each with its own delete button. Nothing when there are none.
 */
export function DownloadedVideosList(): ReactElement | null {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const videos = useDownloadedVideos();
  const [shown, setShown] = useState(false);
  if (videos.length === 0) {
    return null;
  }
  return (
    <View style={[styles.card, { borderColor: `${mutedColor}22` }]}>
      <View style={styles.toggleRow}>
        <Text style={[styles.toggleLabel, { color: textColor }]}>Show downloaded videos</Text>
        <Switch
          testID="settings-show-downloads"
          value={shown}
          onValueChange={setShown}
          accessibilityLabel="Show downloaded videos"
        />
      </View>
      {shown ? <VideoItems videos={videos} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  items: {
    marginTop: 12,
    gap: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumbnail: {
    width: 96,
    aspectRatio: WIDESCREEN_ASPECT_RATIO,
    borderRadius: 6,
  },
  itemText: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  meta: {
    fontSize: 12,
  },
  deleteAll: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  deleteAllText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
