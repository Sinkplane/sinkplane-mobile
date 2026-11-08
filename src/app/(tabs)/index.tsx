import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { SubscriptionPicker } from '@/components/videos/SubscriptionPicker';
import { VideoListItem } from '@/components/videos/VideoListItem';
import { VideoSearchBar } from '@/components/videos/VideoSearchBar';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useListGrid } from '@/hooks/use-screen-layout';
import { useSubscriptionFeed } from '@/hooks/use-subscription-feed';
import { useTabScreenInsets } from '@/hooks/use-tab-screen-insets';
import { AssDass, useGetVideoProgress, useSession, useThemeColor, type Creator, type Video } from '@/shared';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

export default function Videos() {
  const { token, creators, subscriptions, setSubscription, setCreator } = useSession();
  const [selectedCreatorId, setSelectedCreatorId] = useState<string>();
  const [selectedChannelId, setSelectedChannelId] = useState<string>();
  const [sort, setSort] = useState(AssDass.DESC);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const insets = useTabScreenInsets();
  const { listKey, columnWidth, ...grid } = useListGrid();

  const backgroundColor = useThemeColor({}, 'background');
  const mutedColor = useThemeColor({}, 'icon');

  const debouncedInput = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const search = debouncedInput.trim() || undefined;

  // "All Subscriptions" (undefined) or one creator; fall back to all when the selection
  // no longer belongs to a subscribed creator.
  const selectedCreator = creators?.find(creator => creator.id === selectedCreatorId);
  const channelId = selectedCreator?.channels.some(channel => channel.id === selectedChannelId) ? selectedChannelId : undefined;
  const creatorIds = useMemo(
    () => (selectedCreator ? [selectedCreator.id] : (creators ?? []).map(creator => creator.id)),
    [selectedCreator, creators],
  );

  const { videos, isLoading, error, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useSubscriptionFeed(
    token ?? undefined,
    { creatorIds, channel: channelId, limit: PAGE_SIZE, search, sort },
  );

  const videoIds = useMemo(() => videos.map(video => video.id), [videos]);
  const { data: progressData } = useGetVideoProgress(token ?? undefined, videoIds);
  const progressById = useMemo(() => new Map(progressData?.map(progress => [progress.id, progress.progress])), [progressData]);

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

  // Switching subscription narrows the feed to that creator and makes it the session's active
  // subscription; picking "All Subscriptions" only widens the feed again.
  const handleSelectCreator = useCallback(
    (creatorId: string | undefined) => {
      setSelectedCreatorId(creatorId);
      setSelectedChannelId(undefined);
      const creator = creatorId ? creators?.find(candidate => candidate.id === creatorId) : undefined;
      if (creator) {
        const subscription = subscriptions?.find(candidate => candidate.creator === creator.id);
        setCreator(creator);
        if (subscription) setSubscription(subscription);
      }
    },
    [creators, subscriptions, setCreator, setSubscription],
  );

  const toggleSearch = useCallback(() => {
    if (searchOpen) {
      setSearchOpen(false);
      setSearchInput('');
    } else {
      setSearchOpen(true);
    }
  }, [searchOpen]);

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
    <View style={[styles.container, { backgroundColor, paddingTop: insets.top }]}>
      <FeedControls
        creators={creators}
        selectedCreator={selectedCreator}
        selectedCreatorId={selectedCreatorId}
        channelId={channelId}
        sort={sort}
        searchOpen={searchOpen}
        searchInput={searchInput}
        onSelectCreator={handleSelectCreator}
        onChannelChange={setSelectedChannelId}
        onSortChange={setSort}
        onSearchToggle={toggleSearch}
        onSearchInputChange={setSearchInput}
      />

      <FlatList
        testID="videos-list"
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
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator style={styles.status} size="large" />
          ) : (
            <Text style={[styles.message, styles.status, { color: mutedColor }]}>
              {error ? `Error loading videos: ${error.message}` : search ? `No videos found for “${search}”.` : 'No videos found.'}
            </Text>
          )
        }
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={styles.footer} /> : undefined}
      />
    </View>
  );
}

/**
 * Everything that steers the feed, pinned above the list: the subscription picker, the
 * search button + expandable field, the newest/oldest toggle, and (for a single creator)
 * its channel chips.
 */
function FeedControls({
  creators,
  selectedCreator,
  selectedCreatorId,
  channelId,
  sort,
  searchOpen,
  searchInput,
  onSelectCreator,
  onChannelChange,
  onSortChange,
  onSearchToggle,
  onSearchInputChange,
}: {
  creators: Creator[];
  selectedCreator: Creator | undefined;
  selectedCreatorId: string | undefined;
  channelId: string | undefined;
  sort: AssDass;
  searchOpen: boolean;
  searchInput: string;
  onSelectCreator: (creatorId: string | undefined) => void;
  onChannelChange: (id: string | undefined) => void;
  onSortChange: (next: AssDass) => void;
  onSearchToggle: () => void;
  onSearchInputChange: (text: string) => void;
}) {
  const mutedColor = useThemeColor({}, 'icon');
  const newest = sort === AssDass.DESC;
  const searchIcon = searchOpen
    ? ({ ios: 'xmark', android: 'close', web: 'close' } as const)
    : ({ ios: 'magnifyingglass', android: 'search', web: 'search' } as const);

  return (
    <View>
      <View style={styles.toolbar}>
        <SubscriptionPicker creators={creators} selectedCreatorId={selectedCreatorId} onSelect={onSelectCreator} />
        <Pressable
          testID="video-search-toggle"
          onPress={onSearchToggle}
          style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={searchOpen ? 'Close search' : 'Search videos'}
          hitSlop={8}
        >
          <SymbolView name={searchIcon} size={18} tintColor={mutedColor} />
        </Pressable>
        <Pressable
          onPress={() => onSortChange(newest ? AssDass.ASC : AssDass.DESC)}
          style={({ pressed }) => [styles.toolButton, styles.sortButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Sorted by ${newest ? 'newest' : 'oldest'} first. Tap to change.`}
          hitSlop={8}
        >
          <SymbolView name={{ ios: 'arrow.up.arrow.down', android: 'swap_vert', web: 'swap_vert' }} size={16} tintColor={mutedColor} />
          <Text style={[styles.sortText, { color: mutedColor }]}>{newest ? 'Newest' : 'Oldest'}</Text>
        </Pressable>
      </View>

      {searchOpen ? <VideoSearchBar value={searchInput} onChangeText={onSearchInputChange} onClose={onSearchToggle} /> : null}

      {selectedCreator && selectedCreator.channels.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {[{ id: undefined, title: 'All' }, ...selectedCreator.channels.map(channel => ({ id: channel.id, title: channel.title }))].map(
            channel => (
              <Chip
                key={channel.id ?? 'all'}
                label={channel.title}
                selected={channel.id === channelId}
                onPress={() => onChannelChange(channel.id)}
              />
            ),
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const textColor = useThemeColor({}, 'text');
  const backgroundColor = useThemeColor({}, 'background');
  const idleColor = useThemeColor({ light: '#f2f2f2', dark: '#222' }, 'background');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.chip, { backgroundColor: selected ? textColor : idleColor }, pressed && styles.pressed]}
    >
      <Text style={[styles.chipText, { color: selected ? backgroundColor : textColor }]}>{label}</Text>
    </Pressable>
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
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  toolButton: {
    padding: 8,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sortText: {
    fontSize: 14,
    fontWeight: '600',
  },
  chips: {
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  pressed: {
    opacity: 0.7,
  },
  status: {
    marginTop: 48,
  },
  message: {
    fontSize: 15,
    textAlign: 'center',
  },
  footer: {
    marginVertical: 16,
  },
});
