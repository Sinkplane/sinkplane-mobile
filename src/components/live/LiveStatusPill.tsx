import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { LiveStatus } from '@/hooks/use-live-streams';
import { useThemeColor } from '@/shared';

export const LIVE_RED = '#e0001b';

const LABELS: Record<LiveStatus, string> = {
  live: 'LIVE',
  offline: 'OFFLINE',
  loading: 'CHECKING…',
  error: 'UNKNOWN',
};

/** A small status chip: a red "● LIVE" while broadcasting, a muted one otherwise. */
export function LiveStatusPill({ status }: Readonly<{ status: LiveStatus }>): ReactElement {
  const mutedBackground = useThemeColor({ light: '#e6e8ea', dark: '#2c2f31' }, 'background');
  const mutedColor = useThemeColor({}, 'icon');
  const live = status === 'live';

  return (
    <View
      testID={`live-status-${status}`}
      style={[styles.pill, { backgroundColor: live ? LIVE_RED : mutedBackground }]}
    >
      {live ? <View style={styles.dot} /> : null}
      <Text style={[styles.label, { color: live ? '#fff' : mutedColor }]}>{LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
