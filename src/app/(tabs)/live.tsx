import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { LiveStreamCard } from '@/components/live/LiveStreamCard';
import { useLiveStreams, type CreatorLiveStream } from '@/hooks/use-live-streams';
import { useTabScreenInsets } from '@/hooks/use-tab-screen-insets';
import { useSession, useThemeColor } from '@/shared';

function EmptyState({ hasCreators }: { hasCreators: boolean }) {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  return (
    <View style={styles.status}>
      <Text style={[styles.emptyTitle, { color: textColor }]}>
        {hasCreators ? 'No live streams' : 'You are not subscribed to any creators'}
      </Text>
      <Text style={[styles.message, { color: mutedColor }]}>
        {hasCreators ? 'None of your creators stream live on Floatplane.' : 'Subscribe to a creator to watch their live streams.'}
      </Text>
    </View>
  );
}

/**
 * Live tab (as in the TV app): every subscribed creator's livestream with its status, live ones
 * first. The tab bar polls the status (see `(tabs)/_layout.tsx`); this re-checks whenever the tab is
 * shown again or pulled to refresh. Tapping a live stream opens the live player.
 */
export default function Live() {
  const { token, creators, isLoading } = useSession();
  const insets = useTabScreenInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');

  const streams = useLiveStreams(token, creators);
  const streamsRef = useRef(streams);
  streamsRef.current = streams;

  const refetchAll = useCallback(() => Promise.all(streamsRef.current.map(stream => stream.refetch())), []);

  // Local state rather than the queries' isFetching: the tab bar's background polls share them.
  const [refreshing, setRefreshing] = useState(false);
  const pullToRefresh = useCallback(() => {
    setRefreshing(true);
    void refetchAll().finally(() => setRefreshing(false));
  }, [refetchAll]);

  // Tabs stay mounted, so re-check when the tab is shown again (the first check is the queries' own).
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) void refetchAll();
      focusedBefore.current = true;
    }, [refetchAll]),
  );

  const router = useRouter();
  const openStream = useCallback(
    (stream: CreatorLiveStream) => router.push({ pathname: '/live/[id]', params: { id: stream.creator.id } }),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: CreatorLiveStream }) => <LiveStreamCard stream={item} onPress={openStream} />,
    [openStream],
  );

  return (
    <View style={[styles.container, { backgroundColor, paddingTop: insets.top }]}>
      <FlatList
        testID="live-list"
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={streams}
        keyExtractor={stream => stream.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullToRefresh} />}
        ListHeaderComponent={<Text style={[styles.title, { color: textColor }]}>Live</Text>}
        ListEmptyComponent={
          isLoading || !creators ? (
            <ActivityIndicator testID="live-loading" style={styles.status} size="large" />
          ) : (
            <EmptyState hasCreators={creators.length > 0} />
          )
        }
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
});
