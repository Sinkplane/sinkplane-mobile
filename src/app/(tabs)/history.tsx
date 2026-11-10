import { useCallback, useEffect, useRef, type ReactElement } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { TabList, TabScreen } from '@/components/tab-screen/TabList';
import { useOpenVideo } from '@/components/videos/use-open-video';
import { VideoListItem } from '@/components/videos/VideoListItem';
import { useWatchHistory } from '@/hooks/use-watch-history';
import { useSession, useThemeColor, type Video } from '@/shared';

/**
 * Tabs stay mounted, so pick up videos watched since the last visit whenever the tab is shown
 * again (the first load is the query's own fetch).
 */
function useRefetchOnFocus(isFetched: boolean, refetch: () => Promise<unknown>): void {
  const isFetchedRef = useRef(isFetched);
  useEffect(() => {
    isFetchedRef.current = isFetched;
  }, [isFetched]);
  useFocusEffect(
    useCallback(() => {
      if (isFetchedRef.current) {
        void refetch();
      }
    }, [refetch]),
  );
}

function HistoryEmpty({
  isLoading,
  error,
}: Readonly<{ isLoading: boolean; error: Error | null }>): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  if (isLoading) {
    return <ActivityIndicator testID="history-loading" style={styles.status} size="large" />;
  }
  if (error !== null) {
    return (
      <Text style={[styles.message, styles.status, { color: mutedColor }]}>
        {`Error loading history: ${error.message}`}
      </Text>
    );
  }
  return (
    <View style={styles.status}>
      <Text style={[styles.emptyTitle, { color: textColor }]}>No watch history found</Text>
      <Text style={[styles.message, { color: mutedColor }]}>
        Watch some videos and they will show up here.
      </Text>
    </View>
  );
}

export default function History(): ReactElement {
  const { token, tokenExpiration } = useSession();
  const textColor = useThemeColor({}, 'text');
  const history = useWatchHistory(token ?? undefined, tokenExpiration ?? undefined);
  const { progressById, refetch } = history;
  useRefetchOnFocus(history.isFetched, refetch);

  const openVideo = useOpenVideo();
  const renderCell = useCallback(
    (video: Video) => (
      <VideoListItem video={video} progress={progressById.get(video.id)} onPress={openVideo} />
    ),
    [progressById, openVideo],
  );
  const onRefresh = useCallback(() => void refetch(), [refetch]);

  return (
    <TabScreen>
      <TabList
        testID="history-list"
        data={history.videos}
        keyOf={(video) => video.id}
        renderCell={renderCell}
        refreshing={history.isRefetching && !history.isFetchingNextPage}
        onRefresh={onRefresh}
        paging={history}
        header={<Text style={[styles.title, { color: textColor }]}>Watch History</Text>}
        empty={<HistoryEmpty isLoading={history.isLoading} error={history.error} />}
      />
    </TabScreen>
  );
}

const styles = StyleSheet.create({
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
});
