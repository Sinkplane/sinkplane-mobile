import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';

import type { Video } from '@/shared';
import { formatDuration } from '@/utils/format-video';

interface SuggestedVideosProps {
  videos: Video[];
  onSelect: (video: Video) => void;
  onReplay: () => void;
  /** Hides the suggestions, bringing back the player's own (ended) controls. */
  onDismiss: () => void;
}

const ASPECT_WIDTH = 16;
const ASPECT_HEIGHT = 9;
const HEADER_HEIGHT = 34;
const CARD_GAP = 12;
const SIDE_PADDING = 12;
const TITLE_LINE_HEIGHT = 16;
const TITLE_MARGIN = 4;
/** Below this height the cards drop to a one-line title. */
const TWO_LINE_MIN_HEIGHT = 150;
/** Thumbnail height bounds: legible on an inline phone player, not oversized on a large one. */
const MIN_THUMB = 40;
const MAX_THUMB = 150;
/** Used until the area has been measured. */
const DEFAULT_SIZE = { width: 0, height: 180 };
const ONE_LINE = 1;
const TWO_LINES = 2;

interface CardSize {
  titleLines: typeof ONE_LINE | typeof TWO_LINES;
  thumbHeight: number;
  width: number;
}

/** Card size for the space available: the thumbnail takes what the header and title leave. */
function cardSize(height: number): CardSize {
  const titleLines = height >= TWO_LINE_MIN_HEIGHT ? TWO_LINES : ONE_LINE;
  const titleHeight = titleLines * TITLE_LINE_HEIGHT + TITLE_MARGIN;
  const room = height - HEADER_HEIGHT - titleHeight - TITLE_MARGIN;
  const thumbHeight = Math.min(MAX_THUMB, Math.max(MIN_THUMB, room));
  return {
    titleLines,
    thumbHeight,
    width: Math.round((thumbHeight * ASPECT_WIDTH) / ASPECT_HEIGHT),
  };
}

/** The header spans the cards when they fit, so its ends line up with the first and last card. */
function headerWidth(count: number, card: CardSize, areaWidth: number): number | undefined {
  if (areaWidth === 0) {
    return undefined;
  }
  const rowWidth = count * card.width + (count - 1) * CARD_GAP;
  return Math.min(rowWidth, areaWidth - SIDE_PADDING - SIDE_PADDING);
}

function Pill({
  icon,
  label,
  accessibilityLabel,
  onPress,
}: Readonly<{
  icon: 'replay' | 'close';
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}>): React.JSX.Element {
  const ios = icon === 'replay' ? 'arrow.counterclockwise' : 'xmark';
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <SymbolView name={{ ios, android: icon, web: icon }} size={14} tintColor="#fff" />
      <Text style={styles.pillText}>{label}</Text>
    </Pressable>
  );
}

function SuggestedCard({
  video,
  card,
  onPress,
}: Readonly<{ video: Video; card: CardSize; onPress: () => void }>): React.JSX.Element {
  const duration = video.metadata.videoDuration;
  return (
    <Pressable
      testID={`suggested-video-${video.id}`}
      onPress={onPress}
      style={({ pressed }) => [{ width: card.width }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={video.title}
    >
      <View style={[styles.thumbnail, { height: card.thumbHeight }]}>
        <Image
          source={video.thumbnail.path}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          recyclingKey={video.id}
        />
        {duration > 0 ? (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(duration)}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.title} numberOfLines={card.titleLines}>
        {video.title}
      </Text>
    </Pressable>
  );
}

/**
 * The end screen's middle: "Up next" with Replay and Hide, then Floatplane's related posts in a
 * row that's centered when it fits and scrolls sideways when it doesn't. Fills the area the
 * player's controls give it (between their top and bottom bars), sizing the cards to its height.
 */
export function SuggestedVideos({
  videos,
  onSelect,
  onReplay,
  onDismiss,
}: Readonly<SuggestedVideosProps>): React.JSX.Element {
  const [size, setSize] = useState(DEFAULT_SIZE);
  const card = cardSize(size.height);
  const onLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    setSize(nativeEvent.layout);
  };
  return (
    <View testID="suggested-videos" style={styles.container} onLayout={onLayout}>
      <View style={[styles.header, { width: headerWidth(videos.length, card, size.width) }]}>
        <Text style={styles.heading}>Up next</Text>
        <Pill icon="replay" label="Replay" accessibilityLabel="Replay" onPress={onReplay} />
        <Pill icon="close" label="Hide" accessibilityLabel="Hide suggestions" onPress={onDismiss} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroller}
        contentContainerStyle={styles.row}
      >
        {videos.map((video) => (
          <SuggestedCard
            key={video.id}
            video={video}
            card={card}
            onPress={() => {
              onSelect(video);
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    paddingHorizontal: SIDE_PADDING,
    boxSizing: 'content-box',
  },
  heading: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  pillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  scroller: {
    flexGrow: 0,
  },
  row: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SIDE_PADDING,
    gap: CARD_GAP,
  },
  thumbnail: {
    aspectRatio: ASPECT_WIDTH / ASPECT_HEIGHT,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#222',
  },
  durationBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  durationText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  title: {
    color: '#fff',
    fontSize: 12,
    lineHeight: TITLE_LINE_HEIGHT,
    marginTop: TITLE_MARGIN,
  },
  pressed: {
    opacity: 0.6,
  },
});
