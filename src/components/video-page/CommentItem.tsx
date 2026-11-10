import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';

import { imagePath } from '@/components/image-path';
import type { PostComment } from '@/hooks/use-post-comments';
import { useThemeColor } from '@/shared';
import { formatCount, formatRelativeDate } from '@/utils/format-video';

function repliesLabel(replies: number): string {
  return `${String(replies)} ${replies === 1 ? 'reply' : 'replies'}`;
}

export const CommentItem = memo(function CommentItem({
  comment,
}: Readonly<{ comment: PostComment }>) {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const placeholderColor = useThemeColor({ light: '#e6e8ea', dark: '#26292b' }, 'background');
  const replies = comment.totalReplies ?? 0;
  const avatarPath = imagePath(comment.user.profileImage);

  return (
    <View testID={`comment-${comment.id}`} style={styles.container}>
      <View style={[styles.avatar, { backgroundColor: placeholderColor }]}>
        {avatarPath === undefined ? null : (
          <Image source={avatarPath} style={StyleSheet.absoluteFill} />
        )}
      </View>
      <View style={styles.body}>
        <Text style={[styles.meta, { color: mutedColor }]} numberOfLines={1}>
          {`@${comment.user.username} · ${formatRelativeDate(comment.postDate)}`}
        </Text>
        <Text style={[styles.text, { color: textColor }]}>{comment.text}</Text>
        <View style={styles.footer}>
          <SymbolView
            name={{ ios: 'hand.thumbsup', android: 'thumb_up', web: 'thumb_up' }}
            size={13}
            tintColor={mutedColor}
          />
          <Text style={[styles.footerText, { color: mutedColor }]}>
            {formatCount(comment.likes)}
          </Text>
          {replies > 0 ? (
            <Text style={[styles.footerText, { color: mutedColor }]}>{repliesLabel(replies)}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  body: {
    flex: 1,
    gap: 3,
  },
  meta: {
    fontSize: 12,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  footerText: {
    fontSize: 12,
    marginRight: 8,
  },
});
