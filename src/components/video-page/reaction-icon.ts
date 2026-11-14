import type { SymbolViewProps } from 'expo-symbols';

import type { ReactionKind } from '@/hooks/use-post-reaction';

const ICONS: Record<ReactionKind, { on: SymbolViewProps['name']; off: SymbolViewProps['name'] }> = {
  like: {
    on: { ios: 'hand.thumbsup.fill', android: 'thumb_up', web: 'thumb_up' },
    off: { ios: 'hand.thumbsup', android: 'thumb_up', web: 'thumb_up' },
  },
  dislike: {
    on: { ios: 'hand.thumbsdown.fill', android: 'thumb_down', web: 'thumb_down' },
    off: { ios: 'hand.thumbsdown', android: 'thumb_down', web: 'thumb_down' },
  },
};

/** The SF Symbol / Material icon of a reaction button, filled while it is the active reaction. */
export function reactionIcon(kind: ReactionKind, active: boolean): SymbolViewProps['name'] {
  return active ? ICONS[kind].on : ICONS[kind].off;
}
