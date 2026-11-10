import type { ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { SubscriptionPicker } from '@/components/videos/SubscriptionPicker';
import { VideoSearchBar } from '@/components/videos/VideoSearchBar';
import { AssDass, useThemeColor, type Creator } from '@/shared';

export interface FeedControlsProps {
  readonly creators: Creator[];
  readonly selectedCreator: Creator | undefined;
  readonly selectedCreatorId: string | undefined;
  readonly channelId: string | undefined;
  readonly sort: AssDass;
  readonly searchOpen: boolean;
  readonly searchInput: string;
  readonly onSelectCreator: (creatorId: string | undefined) => void;
  readonly onChannelChange: (id: string | undefined) => void;
  readonly onSortChange: (next: AssDass) => void;
  readonly onSearchToggle: () => void;
  readonly onSearchInputChange: (text: string) => void;
}

const CLOSE_ICON = { ios: 'xmark', android: 'close', web: 'close' } as const;
const SEARCH_ICON = { ios: 'magnifyingglass', android: 'search', web: 'search' } as const;
const SORT_ICON = { ios: 'arrow.up.arrow.down', android: 'swap_vert', web: 'swap_vert' } as const;
const CHIP_IDLE_COLORS = { light: '#f2f2f2', dark: '#222' };

function SearchToggle({
  searchOpen,
  onSearchToggle,
}: Pick<FeedControlsProps, 'searchOpen' | 'onSearchToggle'>): ReactElement {
  const mutedColor = useThemeColor({}, 'icon');
  return (
    <Pressable
      testID="video-search-toggle"
      onPress={onSearchToggle}
      style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={searchOpen ? 'Close search' : 'Search videos'}
      hitSlop={8}
    >
      <SymbolView name={searchOpen ? CLOSE_ICON : SEARCH_ICON} size={18} tintColor={mutedColor} />
    </Pressable>
  );
}

function SortToggle({
  sort,
  onSortChange,
}: Pick<FeedControlsProps, 'sort' | 'onSortChange'>): ReactElement {
  const mutedColor = useThemeColor({}, 'icon');
  const newest = sort === AssDass.DESC;
  return (
    <Pressable
      onPress={() => {
        onSortChange(newest ? AssDass.ASC : AssDass.DESC);
      }}
      style={({ pressed }) => [styles.toolButton, styles.sortButton, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Sorted by ${newest ? 'newest' : 'oldest'} first. Tap to change.`}
      hitSlop={8}
    >
      <SymbolView name={SORT_ICON} size={16} tintColor={mutedColor} />
      <Text style={[styles.sortText, { color: mutedColor }]}>{newest ? 'Newest' : 'Oldest'}</Text>
    </Pressable>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: Readonly<{ label: string; selected: boolean; onPress: () => void }>): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const backgroundColor = useThemeColor({}, 'background');
  const idleColor = useThemeColor(CHIP_IDLE_COLORS, 'background');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? textColor : idleColor },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? backgroundColor : textColor }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** "All" plus one chip per channel of the selected creator. */
function ChannelChips({
  creator,
  channelId,
  onChannelChange,
}: Readonly<{
  creator: Creator;
  channelId: string | undefined;
  onChannelChange: (id: string | undefined) => void;
}>): ReactElement {
  const chips = [
    { id: undefined, title: 'All' },
    ...creator.channels.map((channel) => ({ id: channel.id, title: channel.title })),
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
    >
      {chips.map((channel) => (
        <Chip
          key={channel.id ?? 'all'}
          label={channel.title}
          selected={channel.id === channelId}
          onPress={() => {
            onChannelChange(channel.id);
          }}
        />
      ))}
    </ScrollView>
  );
}

/** Channel chips only make sense for a single creator with more than one channel. */
function hasChannelChoice(creator: Creator | undefined): creator is Creator {
  return creator !== undefined && creator.channels.length > 1;
}

/**
 * Everything that steers the feed, pinned above the list: the subscription picker, the
 * search button + expandable field, the newest/oldest toggle, and (for a single creator)
 * its channel chips.
 */
export function FeedControls(props: FeedControlsProps): ReactElement {
  const { selectedCreator, searchOpen, onSearchToggle } = props;
  return (
    <View>
      <View style={styles.toolbar}>
        <SubscriptionPicker
          creators={props.creators}
          selectedCreatorId={props.selectedCreatorId}
          onSelect={props.onSelectCreator}
        />
        <SearchToggle searchOpen={searchOpen} onSearchToggle={onSearchToggle} />
        <SortToggle sort={props.sort} onSortChange={props.onSortChange} />
      </View>
      {searchOpen ? (
        <VideoSearchBar
          value={props.searchInput}
          onChangeText={props.onSearchInputChange}
          onClose={onSearchToggle}
        />
      ) : null}
      {hasChannelChoice(selectedCreator) ? (
        <ChannelChips
          creator={selectedCreator}
          channelId={props.channelId}
          onChannelChange={props.onChannelChange}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  pressed: {
    opacity: 0.7,
  },
});
