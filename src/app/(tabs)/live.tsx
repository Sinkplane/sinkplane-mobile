import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { LiveStreamCard } from '@/components/live/LiveStreamCard';
import { TabList, TabScreen } from '@/components/tab-screen/TabList';
import { useLiveStreams, type CreatorLiveStream } from '@/hooks/use-live-streams';
import { useSession, useThemeColor } from '@/shared';

function EmptyState({ hasCreators }: Readonly<{ hasCreators: boolean }>): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  return (
    <View style={styles.status}>
      <Text style={[styles.emptyTitle, { color: textColor }]}>
        {hasCreators ? 'No live streams' : 'You are not subscribed to any creators'}
      </Text>
      <Text style={[styles.message, { color: mutedColor }]}>
        {hasCreators
          ? 'None of your creators stream live on Floatplane.'
          : 'Subscribe to a creator to watch their live streams.'}
      </Text>
    </View>
  );
}

/**
 * Re-checks every stream: on pull-to-refresh (with its own spinner state rather than the queries'
 * isFetching, which the tab bar's background polls share) and whenever the tab is shown again
 * (tabs stay mounted; the first check is the queries' own).
 */
function useStreamRefresh(streams: CreatorLiveStream[]) {
  const streamsRef = useRef(streams);
  useEffect(() => {
    streamsRef.current = streams;
  }, [streams]);

  const refetchAll = useCallback(
    () => Promise.all(streamsRef.current.map((stream) => stream.refetch())),
    [],
  );

  const [refreshing, setRefreshing] = useState(false);
  const pullToRefresh = useCallback(() => {
    setRefreshing(true);
    void refetchAll().finally(() => {
      setRefreshing(false);
    });
  }, [refetchAll]);

  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) {
        void refetchAll();
      }
      focusedBefore.current = true;
    }, [refetchAll]),
  );

  return { refreshing, pullToRefresh };
}

function useStreamCell() {
  const router = useRouter();
  const openStream = useCallback(
    (stream: CreatorLiveStream) => {
      router.push({ pathname: '/live/[id]', params: { id: stream.creator.id } });
    },
    [router],
  );
  return useCallback(
    (stream: CreatorLiveStream) => <LiveStreamCard stream={stream} onPress={openStream} />,
    [openStream],
  );
}

/**
 * Live tab (as in the TV app): every subscribed creator's livestream with its status, live ones
 * first. The tab bar polls the status (see `(tabs)/_layout.tsx`); this re-checks whenever the tab is
 * shown again or pulled to refresh. Tapping a live stream opens the live player.
 */
export default function Live(): ReactElement {
  const { token, creators, isLoading } = useSession();
  const textColor = useThemeColor({}, 'text');
  const streams = useLiveStreams(token, creators);
  const { refreshing, pullToRefresh } = useStreamRefresh(streams);
  const renderCell = useStreamCell();

  return (
    <TabScreen>
      <TabList
        testID="live-list"
        data={streams}
        keyOf={(stream) => stream.id}
        renderCell={renderCell}
        refreshing={refreshing}
        onRefresh={pullToRefresh}
        header={<Text style={[styles.title, { color: textColor }]}>Live</Text>}
        empty={
          isLoading || !creators ? (
            <ActivityIndicator testID="live-loading" style={styles.status} size="large" />
          ) : (
            <EmptyState hasCreators={creators.length > 0} />
          )
        }
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
