import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { reactionIcon } from '@/components/video-page/reaction-icon';
import type { PostReaction, ReactionKind } from '@/hooks/use-post-reaction';
import { useThemeColor } from '@/shared';
import { formatCount } from '@/utils/format-video';

const ICON_SIZE = 14;
/** Grows the small buttons' touch area to a comfortable size without moving them apart. */
const HIT_SLOP = { top: 10, bottom: 10, left: 6, right: 6 };
const LABEL: Record<ReactionKind, string> = { like: 'Like', dislike: 'Dislike' };

interface CommentReactionsProps {
  readonly commentId: string;
  readonly reaction: PostReaction;
  /** Offline: the buttons are off (a reaction couldn't be sent). */
  readonly disabled?: boolean;
}

interface ReactionButtonProps extends CommentReactionsProps {
  readonly kind: ReactionKind;
  readonly count: number;
}

function ReactionButton({
  commentId,
  reaction,
  kind,
  count,
  disabled = false,
}: ReactionButtonProps): ReactElement {
  const mutedColor = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const active = reaction.reaction === kind;
  const color = active ? tint : mutedColor;
  const testID = `comment-${commentId}-${kind}`;
  const off = disabled || reaction.isPending;
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        reaction.toggle(kind);
      }}
      disabled={off}
      hitSlop={HIT_SLOP}
      style={({ pressed }) => [styles.button, (pressed || disabled) && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${LABEL[kind]} comment, ${String(count)}`}
      accessibilityState={{ selected: active, disabled: off }}
    >
      <SymbolView name={reactionIcon(kind, active)} size={ICON_SIZE} tintColor={color} />
      <Text testID={`${testID}-count`} style={[styles.count, { color }]}>
        {formatCount(count)}
      </Text>
    </Pressable>
  );
}

/** A comment's like / dislike buttons; pressing the active one again removes it. */
export function CommentReactions({
  commentId,
  reaction,
  disabled = false,
}: CommentReactionsProps): ReactElement {
  return (
    <View style={styles.row}>
      <ReactionButton
        commentId={commentId}
        reaction={reaction}
        kind="like"
        count={reaction.likes}
        disabled={disabled}
      />
      <ReactionButton
        commentId={commentId}
        reaction={reaction}
        kind="dislike"
        count={reaction.dislikes}
        disabled={disabled}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginRight: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
  },
  pressed: {
    opacity: 0.6,
  },
  count: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});
