import type { ReactElement } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { confirmDeleteAllDownloads, useDownloadMenu } from '@/components/downloads/download-menus';
import { DownloadRow } from '@/components/downloads/DownloadRow';
import { SaveToPhotosStatus } from '@/components/downloads/SaveToPhotosStatus';
import { ScreenHeader } from '@/components/downloads/ScreenHeader';
import type { SaveToPhotosState } from '@/hooks/use-save-to-photos';
import { useDownloadedVideos } from '@/hooks/use-video-download';
import { useThemeColor } from '@/shared';
import type { DownloadedVideo } from '@/utils/download-library';
import { downloadsSummary } from '@/utils/downloads-summary';

/** Breathing room below the last row, on top of the safe-area inset. */
const LIST_BOTTOM_PADDING = 24;

interface ListTopProps {
  readonly videos: readonly DownloadedVideo[];
  readonly saveState: SaveToPhotosState;
}

/** The total, "Delete all", and the latest "Save to Photos" result. */
function ListTop({ videos, saveState }: ListTopProps): ReactElement | null {
  const mutedColor = useThemeColor({}, 'icon');
  const linkColor = useThemeColor({}, 'link');
  if (videos.length === 0) {
    return null;
  }
  return (
    <View style={styles.top}>
      <View style={styles.summaryRow}>
        <Text testID="downloads-summary" style={[styles.summary, { color: mutedColor }]}>
          {downloadsSummary(videos)}
        </Text>
        <Pressable
          testID="downloads-delete-all"
          onPress={() => {
            confirmDeleteAllDownloads(videos);
          }}
          accessibilityRole="button"
        >
          <Text style={[styles.deleteAll, { color: linkColor }]}>Delete all</Text>
        </Pressable>
      </View>
      <SaveToPhotosStatus state={saveState} />
    </View>
  );
}

function EmptyDownloads(): ReactElement {
  const mutedColor = useThemeColor({}, 'icon');
  return (
    <Text testID="downloads-empty" style={[styles.empty, { color: mutedColor }]}>
      No downloads yet. Long-press a video, or use Download on its page.
    </Text>
  );
}

/** The Downloads screen: every downloaded video, playable offline, with their actions. */
export function DownloadsScreen(): ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const backgroundColor = useThemeColor({}, 'background');
  const videos = useDownloadedVideos();
  const menu = useDownloadMenu();
  const play = (video: DownloadedVideo) => {
    router.push({ pathname: '/video/[id]', params: { id: video.postId } });
  };
  return (
    <View
      testID="downloads-screen"
      style={[styles.screen, { backgroundColor, paddingTop: insets.top }]}
    >
      <ScreenHeader title="Downloads" />
      <FlatList
        testID="downloads-list"
        data={videos}
        keyExtractor={(video) => video.postId}
        renderItem={({ item }) => <DownloadRow video={item} onPress={play} onMore={menu.open} />}
        ListHeaderComponent={<ListTop videos={videos} saveState={menu.saveState} />}
        ListEmptyComponent={<EmptyDownloads />}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + LIST_BOTTOM_PADDING },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    // Readable width on tablets.
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  top: {
    gap: 6,
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summary: {
    fontSize: 14,
  },
  deleteAll: {
    fontSize: 14,
    fontWeight: '600',
  },
  empty: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 48,
    paddingHorizontal: 24,
  },
});
