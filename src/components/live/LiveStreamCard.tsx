import { memo, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { LiveStatusPill } from '@/components/live/LiveStatusPill';
import type { CreatorLiveStream } from '@/hooks/use-live-streams';
import { useThemeColor } from '@/shared';
import { WIDESCREEN_ASPECT_RATIO } from '@/components/aspect-ratio';
import { imagePath } from '@/components/image-path';
import { liveStreamCopy, type LiveStreamCopy } from '@/components/live/live-stream-copy';

interface LiveStreamCardProps {
  readonly stream: CreatorLiveStream;
  /** Opens the live player; only live cards are pressable. */
  readonly onPress?: (stream: CreatorLiveStream) => void;
}

const THUMBNAIL_TRANSITION_MS = 150;
const PLACEHOLDER_COLORS = { light: '#e6e8ea', dark: '#26292b' };

interface CardPartProps {
  readonly stream: CreatorLiveStream;
  readonly copy: LiveStreamCopy;
  readonly placeholderColor: string;
}

function CardThumbnail({ stream, copy, placeholderColor }: CardPartProps): ReactElement {
  return (
    <View style={[styles.thumbnail, { backgroundColor: placeholderColor }]}>
      <Image
        source={copy.thumbnail ?? null}
        style={[StyleSheet.absoluteFill, stream.status !== 'live' && styles.dimmed]}
        contentFit="cover"
        transition={THUMBNAIL_TRANSITION_MS}
      />
      <View style={styles.pill}>
        <LiveStatusPill status={stream.status} />
      </View>
    </View>
  );
}

/** Below the title: why the status is unknown, or the offline card's description. */
function CardNote({ stream, copy }: Omit<CardPartProps, 'placeholderColor'>): ReactElement | null {
  const mutedColor = useThemeColor({}, 'icon');
  if (stream.status === 'error') {
    return (
      <Text style={[styles.meta, { color: mutedColor }]}>
        Couldn&apos;t check the stream status. Pull to retry.
      </Text>
    );
  }
  if (stream.status === 'live' || copy.description === '') {
    return null;
  }
  return (
    <Text style={[styles.meta, { color: mutedColor }]} numberOfLines={2}>
      {copy.description}
    </Text>
  );
}

function CardDetails({ stream, copy, placeholderColor }: CardPartProps): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const iconPath = imagePath(stream.creator.icon);
  return (
    <View style={styles.details}>
      {iconPath === undefined ? null : (
        <Image
          source={iconPath}
          style={[styles.creatorIcon, { backgroundColor: placeholderColor }]}
        />
      )}
      <View style={styles.textColumn}>
        <Text style={[styles.title, { color: textColor }]} numberOfLines={2}>
          {copy.title}
        </Text>
        <Text style={[styles.meta, { color: mutedColor }]} numberOfLines={1}>
          {stream.creator.title}
        </Text>
        <CardNote stream={stream} copy={copy} />
      </View>
    </View>
  );
}

/** One creator's livestream on the Live tab: thumbnail, status, stream title and creator. */
export const LiveStreamCard = memo(function LiveStreamCard({
  stream,
  onPress,
}: LiveStreamCardProps) {
  const placeholderColor = useThemeColor(PLACEHOLDER_COLORS, 'background');
  const live = stream.status === 'live';
  const copy = liveStreamCopy(stream);
  const press =
    live && onPress !== undefined
      ? () => {
          onPress(stream);
        }
      : undefined;

  return (
    <Pressable
      testID={`live-stream-${stream.creator.id}`}
      onPress={press}
      disabled={!live}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      accessibilityRole={live ? 'button' : undefined}
      accessibilityLabel={live ? `Watch ${stream.creator.title} live: ${copy.title}` : undefined}
    >
      <CardThumbnail stream={stream} copy={copy} placeholderColor={placeholderColor} />
      <CardDetails stream={stream} copy={copy} placeholderColor={placeholderColor} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  pressed: {
    opacity: 0.7,
  },
  thumbnail: {
    width: '100%',
    aspectRatio: WIDESCREEN_ASPECT_RATIO,
    borderRadius: 12,
    overflow: 'hidden',
  },
  dimmed: {
    opacity: 0.6,
  },
  pill: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  details: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 10,
  },
  creatorIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  meta: {
    fontSize: 13,
  },
});
