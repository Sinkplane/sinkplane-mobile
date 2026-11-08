import { useCallback, useRef } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { VideoListItem } from '@/components/videos/VideoListItem';
import { useListGrid } from '@/hooks/use-screen-layout';
import { useTabScreenInsets } from '@/hooks/use-tab-screen-insets';
import { useWatchHistory } from '@/hooks/use-watch-history';
import { useSession, useThemeColor, type Video } from '@/shared';

export default function History() {
  const { token, tokenExpiration } = useSession();
  const insets = useTabScreenInsets();
  const { listKey, columnWidth, ...grid } = useListGrid();

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');

  const { videos, progressById, isLoading, isFetched, error, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useWatchHistory(token ?? undefined, tokenExpiration ?? undefined);

  // Tabs stay mounted, so pick up videos watched since the last visit whenever the tab is shown
  // again (the first load is the query's own fetch).
  const isFetchedRef = useRef(isFetched);
  isFetchedRef.current = isFetched;
  useFocusEffect(
    useCallback(() => {
      if (isFetchedRef.current) void refetch();
    }, [refetch]),
  );

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const router = useRouter();
  const openVideo = useCallback((video: Video) => router.push({ pathname: '/video/[id]', params: { id: video.id } }), [router]);

  const renderItem = useCallback(
    ({ item }: { item: Video }) => (
      <View style={{ width: columnWidth }}>
        <VideoListItem video={item} progress={progressById.get(item.id)} onPress={openVideo} />
      </View>
    ),
    [progressById, openVideo, columnWidth],
  );

  return (
    <View style={[styles.container, { backgroundColor, paddingTop: insets.top }]}>
      <FlatList
        testID="history-list"
        key={listKey}
        {...grid}
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={videos}
        keyExtractor={video => video.id}
        renderItem={renderItem}
        onEndReached={loadMore}
        onEndReachedThreshold={1.5}
        refreshControl={<RefreshControl refreshing={isRefetching && !isFetchingNextPage} onRefresh={() => void refetch()} />}
        ListHeaderComponent={<Text style={[styles.title, { color: textColor }]}>Watch History</Text>}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator testID="history-loading" style={styles.status} size="large" />
          ) : error ? (
            <Text style={[styles.message, styles.status, { color: mutedColor }]}>{`Error loading history: ${error.message}`}</Text>
          ) : (
            <View style={styles.status}>
              <Text style={[styles.emptyTitle, { color: textColor }]}>No watch history found</Text>
              <Text style={[styles.message, { color: mutedColor }]}>Watch some videos and they will show up here.</Text>
            </View>
          )
        }
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={styles.footer} /> : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 16,
  },
  status: {
    marginTop: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    textAlign: 'center',
  },
  footer: {
    marginVertical: 16,
  },
});
