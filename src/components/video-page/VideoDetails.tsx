import { useMemo, useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { imagePath, type ApiImage } from '@/components/image-path';
import { ReactionBar } from '@/components/video-page/ReactionBar';
import { useOpenLink } from '@/components/video-page/use-open-link';
import type { usePostReaction } from '@/hooks/use-post-reaction';
import { useThemeColor, type VideoPost } from '@/shared';
import { formatRelativeDate, htmlToSegments, type TextSegment } from '@/utils/format-video';

interface VideoDetailsProps {
  readonly post: VideoPost;
  readonly reaction: ReturnType<typeof usePostReaction>;
}

/** A post's channel or creator as the API may send it (either can be missing, or lack an icon). */
type PostOwner = { readonly title: string; readonly icon?: ApiImage | null } | null | undefined;

/** What the header reads from the post; the API can omit the channel and the comment count. */
interface PostHeaderSource {
  readonly channel?: PostOwner;
  readonly creator?: PostOwner;
  readonly comments?: number | null;
}

const COLLAPSED_LINES = 3;
/** Roughly what fits in the collapsed lines; shorter descriptions get no toggle. */
const COLLAPSIBLE_CHARS = 160;
const SHOW_MORE_HIT_SLOP = 8;
const PLACEHOLDER_COLORS = { light: '#e6e8ea', dark: '#26292b' };

function isCollapsible(text: string): boolean {
  return text.length > COLLAPSIBLE_CHARS || text.split('\n').length > COLLAPSED_LINES;
}

/** The body's text runs, its links as tappable runs. */
function DescriptionSegments({
  segments,
}: Readonly<{ segments: readonly TextSegment[] }>): ReactElement {
  const linkColor = useThemeColor({}, 'link');
  const openLink = useOpenLink();
  return (
    <>
      {segments.map(({ text, href }, index) =>
        href === undefined ? (
          text
        ) : (
          <Text
            key={index}
            accessibilityRole="link"
            style={{ color: linkColor }}
            onPress={() => {
              openLink(href);
            }}
          >
            {text}
          </Text>
        ),
      )}
    </>
  );
}

/** The post body, collapsed to a few lines with a Show more / Show less toggle when long. */
function PostDescription({
  html,
}: Readonly<{ html: string | null | undefined }>): ReactElement | null {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const [expanded, setExpanded] = useState(false);
  const segments = useMemo(() => htmlToSegments(html), [html]);
  if (segments.length === 0) {
    return null;
  }

  const collapsible = isCollapsible(segments.map((segment) => segment.text).join(''));
  return (
    <View>
      <Text
        testID="post-description"
        style={[styles.description, { color: textColor }]}
        numberOfLines={collapsible && !expanded ? COLLAPSED_LINES : undefined}
      >
        <DescriptionSegments segments={segments} />
      </Text>
      {collapsible ? (
        <Pressable
          onPress={() => {
            setExpanded((e) => !e);
          }}
          hitSlop={SHOW_MORE_HIT_SLOP}
          accessibilityRole="button"
          style={styles.showMore}
        >
          <Text style={[styles.showMoreText, { color: mutedColor }]}>
            {expanded ? 'Show less' : 'Show more'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ownerIconPath({ channel, creator }: PostHeaderSource): string | undefined {
  return imagePath(channel?.icon) ?? imagePath(creator?.icon);
}

function ownerTitle({ channel, creator }: PostHeaderSource): string | undefined {
  return channel?.title ?? creator?.title;
}

/** The channel's icon and name, falling back to the creator's when the post has no channel. */
function ChannelRow({ source }: Readonly<{ source: PostHeaderSource }>): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const placeholderColor = useThemeColor(PLACEHOLDER_COLORS, 'background');
  const iconPath = ownerIconPath(source);
  const title = ownerTitle(source);
  return (
    <View style={styles.channelRow}>
      <View style={[styles.channelIcon, { backgroundColor: placeholderColor }]}>
        {iconPath === undefined ? null : (
          <Image source={iconPath} style={StyleSheet.absoluteFill} />
        )}
      </View>
      <Text style={[styles.channelName, { color: textColor }]} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

function PostReactions({ reaction }: Pick<VideoDetailsProps, 'reaction'>): ReactElement {
  const mutedColor = useThemeColor({}, 'icon');
  return (
    <>
      <ReactionBar
        reaction={reaction.reaction}
        likes={reaction.likes}
        dislikes={reaction.dislikes}
        disabled={reaction.isPending}
        onToggle={reaction.toggle}
      />
      {reaction.error === null ? null : (
        <Text style={[styles.error, { color: mutedColor }]}>
          Couldn&apos;t save your reaction. Try again.
        </Text>
      )}
    </>
  );
}

/** Title, channel, reactions, description and the comments heading shown above the comment list. */
export function VideoDetails({ post, reaction }: VideoDetailsProps): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const source: PostHeaderSource = post;

  return (
    <View style={styles.container}>
      <Text testID="video-title" style={[styles.title, { color: textColor }]}>
        {post.title}
      </Text>
      <Text style={[styles.meta, { color: mutedColor }]}>
        {formatRelativeDate(post.releaseDate)}
      </Text>
      <ChannelRow source={source} />
      <PostReactions reaction={reaction} />
      <PostDescription html={post.text} />
      <Text style={[styles.commentsHeading, { color: textColor }]}>
        {`Comments · ${String(source.comments ?? 0)}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 14,
    gap: 10,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 25,
  },
  meta: {
    fontSize: 13,
    marginTop: -6,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  channelIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  channelName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  error: {
    fontSize: 13,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  showMore: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  showMoreText: {
    fontSize: 13,
    fontWeight: '600',
  },
  commentsHeading: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
});
