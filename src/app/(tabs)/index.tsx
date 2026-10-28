import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';

import { VideoListItem } from '@/components/videos/VideoListItem';
import { useTabScreenInsets } from '@/hooks/use-tab-screen-insets';
import { AssDass, useGetVideoProgress, useGetVideosInfinite, useSession, useThemeColor, type Creator, type Video } from '@/shared';

const PAGE_SIZE = 20;

export default function Videos() {
  const { token, tokenExpiration, creator } = useSession();
  const [selectedChannelId, setSelectedChannelId] = useState<string>();
  const [sort, setSort] = useState(AssDass.DESC);
  const insets = useTabScreenInsets();

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');

  // Fall back to "All" when the selected channel doesn't belong to the current creator.
  const channelId = creator?.channels.some(c => c.id === selectedChannelId) ? selectedChannelId : undefined;

  const { data, isLoading, error, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useGetVideosInfinite(
    token ?? undefined,
    tokenExpiration ?? undefined,
    creator ? { id: creator.id, channel: channelId, limit: PAGE_SIZE, sort } : undefined,
  );

  const videos = useMemo(() => data?.pages.flat() ?? [], [data?.pages]);
  const videoIds = useMemo(() => videos.map(v => v.id), [videos]);
  const { data: progressData } = useGetVideoProgress(token ?? undefined, videoIds);
  const progressById = useMemo(() => new Map(progressData?.map(p => [p.id, p.progress])), [progressData]);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // There's no in-app player yet — hand off to floatplane.com.
  const openVideo = useCallback((video: Video) => {
    Linking.openURL(`https://www.floatplane.com/post/${video.id}`);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Video }) => <VideoListItem video={item} progress={progressById.get(item.id)} onPress={openVideo} />,
    [progressById, openVideo],
  );

  if (!creator) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor }]}>
        <Text style={[styles.message, { color: mutedColor }]}>You are not subscribed to any creators.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor, paddingTop: insets.top }]}>
      <FlatList
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={videos}
        keyExtractor={video => video.id}
        renderItem={renderItem}
        onEndReached={loadMore}
        onEndReachedThreshold={1.5}
        refreshControl={<RefreshControl refreshing={isRefetching && !isFetchingNextPage} onRefresh={() => void refetch()} />}
        ListHeaderComponent={
          <VideosHeader
            creator={creator}
            channelId={channelId}
            onChannelChange={setSelectedChannelId}
            sort={sort}
            onSortChange={setSort}
            textColor={textColor}
            mutedColor={mutedColor}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator style={styles.status} size="large" />
          ) : (
            <Text style={[styles.message, styles.status, { color: mutedColor }]}>
              {error ? `Error loading videos: ${error.message}` : 'No videos found.'}
            </Text>
          )
        }
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={styles.footer} /> : undefined}
      />
    </View>
  );
}

function VideosHeader({
  creator,
  channelId,
  onChannelChange,
  sort,
  onSortChange,
  textColor,
  mutedColor,
}: {
  creator: Creator;
  channelId: string | undefined;
  onChannelChange: (id: string | undefined) => void;
  sort: AssDass;
  onSortChange: (next: AssDass) => void;
  textColor: string;
  mutedColor: string;
}) {
  const channels = [{ id: undefined, title: 'All' }, ...creator.channels.map(c => ({ id: c.id, title: c.title }))];
  const newest = sort === AssDass.DESC;

  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        {creator.icon?.path ? <Image source={creator.icon.path} style={styles.creatorIcon} /> : null}
        <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
          {creator.title}
        </Text>
        <Pressable
          onPress={() => onSortChange(newest ? AssDass.ASC : AssDass.DESC)}
          style={({ pressed }) => [styles.sortButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Sorted by ${newest ? 'newest' : 'oldest'} first. Tap to change.`}
          hitSlop={8}
        >
          <SymbolView name={{ ios: 'arrow.up.arrow.down', android: 'swap_vert', web: 'swap_vert' }} size={16} tintColor={mutedColor} />
          <Text style={[styles.sortText, { color: mutedColor }]}>{newest ? 'Newest' : 'Oldest'}</Text>
        </Pressable>
      </View>

      {creator.channels.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {channels.map(channel => (
            <Chip
              key={channel.id ?? 'all'}
              label={channel.title}
              selected={channel.id === channelId}
              onPress={() => onChannelChange(channel.id)}
            />
          ))}
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
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  header: {
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  creatorIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  title: {
    flex: 1,
    fontSize: 26,
    fontWeight: 'bold',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  sortText: {
    fontSize: 14,
    fontWeight: '600',
  },
  chips: {
    gap: 8,
    paddingTop: 14,
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
