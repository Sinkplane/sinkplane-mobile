import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { ReactionBar } from '@/components/video-page/ReactionBar';
import type { usePostReaction } from '@/hooks/use-post-reaction';
import { useThemeColor, type VideoPost } from '@/shared';
import { formatRelativeDate } from '@/utils/format-video';

interface VideoDetailsProps {
  post: VideoPost;
  reaction: ReturnType<typeof usePostReaction>;
}

/** Title, channel, reactions and the comments heading shown above the comment list. */
export function VideoDetails({ post, reaction }: VideoDetailsProps) {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const placeholderColor = useThemeColor({ light: '#e6e8ea', dark: '#26292b' }, 'background');
  const channelIcon = post.channel?.icon?.path ?? post.creator?.icon?.path;

  return (
    <View style={styles.container}>
      <Text testID="video-title" style={[styles.title, { color: textColor }]}>
        {post.title}
      </Text>
      <Text style={[styles.meta, { color: mutedColor }]}>{formatRelativeDate(post.releaseDate)}</Text>

      <View style={styles.channelRow}>
        <View style={[styles.channelIcon, { backgroundColor: placeholderColor }]}>
          {channelIcon ? <Image source={channelIcon} style={StyleSheet.absoluteFill} /> : null}
        </View>
        <Text style={[styles.channelName, { color: textColor }]} numberOfLines={1}>
          {post.channel?.title ?? post.creator?.title}
        </Text>
      </View>

      <ReactionBar
        reaction={reaction.reaction}
        likes={reaction.likes}
        dislikes={reaction.dislikes}
        disabled={reaction.isPending}
        onToggle={reaction.toggle}
      />
      {reaction.error ? <Text style={[styles.error, { color: mutedColor }]}>Couldn&apos;t save your reaction. Try again.</Text> : null}

      <Text style={[styles.commentsHeading, { color: textColor }]}>{`Comments · ${post.comments ?? 0}`}</Text>
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
  commentsHeading: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
});
