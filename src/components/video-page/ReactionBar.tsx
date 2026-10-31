import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import type { Reaction } from '@/hooks/use-post-reaction';
import { useThemeColor } from '@/shared';
import { formatCount } from '@/utils/format-video';

interface ReactionBarProps {
  reaction: Reaction;
  likes: number;
  dislikes: number;
  disabled?: boolean;
  onToggle: (kind: 'like' | 'dislike') => void;
}

const ICONS: Record<'like' | 'dislike', { on: SymbolViewProps['name']; off: SymbolViewProps['name'] }> = {
  like: {
    on: { ios: 'hand.thumbsup.fill', android: 'thumb_up', web: 'thumb_up' },
    off: { ios: 'hand.thumbsup', android: 'thumb_up', web: 'thumb_up' },
  },
  dislike: {
    on: { ios: 'hand.thumbsdown.fill', android: 'thumb_down', web: 'thumb_down' },
    off: { ios: 'hand.thumbsdown', android: 'thumb_down', web: 'thumb_down' },
  },
};

/** Like / dislike pill; the active reaction is highlighted and pressing it again removes it. */
export function ReactionBar({ reaction, likes, dislikes, disabled, onToggle }: ReactionBarProps) {
  const textColor = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  const pillColor = useThemeColor({ light: '#eceef0', dark: '#26292b' }, 'background');

  const button = (kind: 'like' | 'dislike', count: number) => {
    const active = reaction === kind;
    const color = active ? tint : textColor;
    return (
      <Pressable
        testID={`reaction-${kind}`}
        onPress={() => onToggle(kind)}
        disabled={disabled}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${kind === 'like' ? 'Like' : 'Dislike'}, ${count}`}
        accessibilityState={{ selected: active, disabled }}
      >
        <SymbolView name={active ? ICONS[kind].on : ICONS[kind].off} size={18} tintColor={color} />
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
