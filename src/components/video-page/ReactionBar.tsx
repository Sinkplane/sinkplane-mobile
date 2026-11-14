import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { reactionIcon } from '@/components/video-page/reaction-icon';
import type { Reaction } from '@/hooks/use-post-reaction';
import { useThemeColor } from '@/shared';
import { formatCount } from '@/utils/format-video';

interface ReactionBarProps {
  readonly reaction: Reaction;
  readonly likes: number;
  readonly dislikes: number;
  readonly disabled?: boolean | undefined;
  readonly onToggle: (kind: 'like' | 'dislike') => void;
}

/** Like / dislike pill; the active reaction is highlighted and pressing it again removes it. */
export function ReactionBar({
  reaction,
  likes,
  dislikes,
  disabled,
  onToggle,
}: ReactionBarProps): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  const pillColor = useThemeColor({ light: '#eceef0', dark: '#26292b' }, 'background');

  const button = (kind: 'like' | 'dislike', count: number) => {
    const active = reaction === kind;
    const color = active ? tint : textColor;
    return (
      <Pressable
        testID={`reaction-${kind}`}
        onPress={() => {
          onToggle(kind);
        }}
        disabled={disabled}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${kind === 'like' ? 'Like' : 'Dislike'}, ${String(count)}`}
        accessibilityState={{ selected: active, disabled }}
      >
        <SymbolView name={reactionIcon(kind, active)} size={18} tintColor={color} />
        <Text testID={`reaction-${kind}-count`} style={[styles.count, { color }]}>
          {formatCount(count)}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.pill, { backgroundColor: pillColor }]}>
      {button('like', likes)}
      <View style={[styles.divider, { backgroundColor: textColor }]} />
      {button('dislike', dislikes)}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 18,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pressed: {
    opacity: 0.6,
  },
  count: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    opacity: 0.3,
  },
});
