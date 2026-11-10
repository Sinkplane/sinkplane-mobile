import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { TabList, TabScreen } from '@/components/tab-screen/TabList';
import { FeedControls } from '@/components/videos/FeedControls';
import { useOpenVideo } from '@/components/videos/use-open-video';
import { VideoListItem } from '@/components/videos/VideoListItem';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useSubscriptionFeed, type SubscriptionFeedParams } from '@/hooks/use-subscription-feed';
import {
  AssDass,
  useGetVideoProgress,
  useSession,
  useThemeColor,
  type Creator,
  type Video,
} from '@/shared';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

/** The search toggle + field state; the query is debounced, trimmed, and undefined when empty. */
function useFeedSearch() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const debouncedInput = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const trimmed = debouncedInput.trim();
  const search = trimmed === '' ? undefined : trimmed;

  const toggleSearch = useCallback(() => {
    if (searchOpen) {
      setSearchOpen(false);
      setSearchInput('');
    } else {
      setSearchOpen(true);
    }
  }, [searchOpen]);

  return { search, searchOpen, searchInput, setSearchInput, toggleSearch };
}

function channelOf(
  creator: Creator | undefined,
  channelId: string | undefined,
): string | undefined {
  return creator?.channels.some((channel) => channel.id === channelId) === true
    ? channelId
    : undefined;
}

/**
 * Which creator (or "All Subscriptions") and channel the feed shows. Switching subscription narrows
 * the feed to that creator and makes it the session's active subscription; picking "All
 * Subscriptions" only widens the feed again.
 */
function useFeedSelection() {
  const { creators, subscriptions, setSubscription, setCreator } = useSession();
  const [selectedCreatorId, setSelectedCreatorId] = useState<string>();
  const [selectedChannelId, setSelectedChannelId] = useState<string>();

  // Fall back to all when the selection no longer belongs to a subscribed creator.
  const selectedCreator = creators?.find((creator) => creator.id === selectedCreatorId);
  const channelId = channelOf(selectedCreator, selectedChannelId);
  const creatorIds = useMemo(
    () => (selectedCreator ? [selectedCreator.id] : (creators ?? []).map((creator) => creator.id)),
    [selectedCreator, creators],
  );

  const selectCreator = useCallback(
    (creatorId: string | undefined) => {
      setSelectedCreatorId(creatorId);
      setSelectedChannelId(undefined);
      const creator = creators?.find((candidate) => candidate.id === creatorId);
      if (creatorId === undefined || creator === undefined) {
        return;
      }
      setCreator(creator);
      const subscription = subscriptions?.find((candidate) => candidate.creator === creator.id);
      if (subscription) {
        setSubscription(subscription);
      }
    },
    [creators, subscriptions, setCreator, setSubscription],
  );

  return {
    selectedCreatorId,
    selectedCreator,
    channelId,
    creatorIds,
    selectCreator,
    setSelectedChannelId,
  };
}

function feedParams(
  base: Pick<SubscriptionFeedParams, 'creatorIds' | 'sort'>,
  channel: string | undefined,
  search: string | undefined,
): SubscriptionFeedParams {
  return {
    ...base,
    limit: PAGE_SIZE,
    ...(channel === undefined ? {} : { channel }),
    ...(search === undefined ? {} : { search }),
  };
}

/** Saved watch progress (seconds) of the listed videos, by video id. */
function useProgressById(token: string | undefined, videos: Video[]): Map<string, number> {
  const videoIds = useMemo(() => videos.map((video) => video.id), [videos]);
  const { data: progressData } = useGetVideoProgress(token, videoIds);
  return useMemo(
    () => new Map(progressData?.map((progress) => [progress.id, progress.progress])),
    [progressData],
  );
}

function emptyFeedMessage(error: Error | null, search: string | undefined): string {
  if (error !== null) {
    return `Error loading videos: ${error.message}`;
  }
  return search === undefined ? 'No videos found.' : `No videos found for “${search}”.`;
}

function FeedEmpty({
  isLoading,
  error,
  search,
}: Readonly<{
  isLoading: boolean;
  error: Error | null;
  search: string | undefined;
}>): ReactElement {
  const mutedColor = useThemeColor({}, 'icon');
  if (isLoading) {
    return <ActivityIndicator style={styles.status} size="large" />;
  }
  return (
    <Text style={[styles.message, styles.status, { color: mutedColor }]}>
      {emptyFeedMessage(error, search)}
    </Text>
  );
}

function useVideoCell(token: string | undefined, videos: Video[]) {
  const progressById = useProgressById(token, videos);
  const openVideo = useOpenVideo();
  return useCallback(
    (video: Video) => (
      <VideoListItem video={video} progress={progressById.get(video.id)} onPress={openVideo} />
    ),
    [progressById, openVideo],
  );
}

function VideoFeed({
  token,
  creatorIds,
  channelId,
  search,
  sort,
}: Readonly<{
  token: string | undefined;
  creatorIds: string[];
  channelId: string | undefined;
  search: string | undefined;
  sort: AssDass;
}>): ReactElement {
  const feed = useSubscriptionFeed(token, feedParams({ creatorIds, sort }, channelId, search));
  const renderCell = useVideoCell(token, feed.videos);
  const { refetch } = feed;
  const onRefresh = useCallback(() => void refetch(), [refetch]);

  return (
    <TabList
      testID="videos-list"
      data={feed.videos}
      keyOf={(video) => video.id}
      renderCell={renderCell}
      refreshing={feed.isRefetching && !feed.isFetchingNextPage}
      onRefresh={onRefresh}
      paging={feed}
      empty={<FeedEmpty isLoading={feed.isLoading} error={feed.error} search={search} />}
    />
  );
}

export default function Videos(): ReactElement {
  const { token, creators } = useSession();
  const [sort, setSort] = useState(AssDass.DESC);
  const searchState = useFeedSearch();
  const selection = useFeedSelection();
  const backgroundColor = useThemeColor({}, 'background');

  // The session provider is still loading subscriptions/creators. (It signs out when there are
  // none, so a signed-in user always ends up with creators.)
  if (!creators) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor }]}>
        <ActivityIndicator testID="videos-loading" size="large" />
      </View>
    );
  }

  return (
    <TabScreen>
      <FeedControls
        creators={creators}
        selectedCreator={selection.selectedCreator}
        selectedCreatorId={selection.selectedCreatorId}
        channelId={selection.channelId}
        sort={sort}
        searchOpen={searchState.searchOpen}
        searchInput={searchState.searchInput}
        onSelectCreator={selection.selectCreator}
        onChannelChange={selection.setSelectedChannelId}
        onSortChange={setSort}
        onSearchToggle={searchState.toggleSearch}
        onSearchInputChange={searchState.setSearchInput}
      />
      <VideoFeed
        token={token ?? undefined}
        creatorIds={selection.creatorIds}
        channelId={selection.channelId}
        search={searchState.search}
        sort={sort}
      />
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  status: {
    marginTop: 48,
  },
  message: {
    fontSize: 15,
    textAlign: 'center',
  },
});
