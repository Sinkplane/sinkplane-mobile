import type { ReactElement } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { downloadingLabel, downloadPercent } from '@/components/downloads/DownloadActionSheet';
import { useDownloadState } from '@/hooks/use-video-download';

const DOWNLOADED_ICON: SymbolViewProps['name'] = {
  ios: 'arrow.down.circle.fill',
  android: 'download_for_offline',
  web: 'download_for_offline',
};
const ICON_SIZE = 16;
const BADGE_TINT = '#fff';

/**
 * The top-right corner of a list thumbnail: the download's progress while it runs, then an icon
 * once the video is on the device. Nothing for other posts.
 */
export function DownloadBadge({ postId }: Readonly<{ postId: string }>): ReactElement | null {
  const state = useDownloadState(postId);
  if (state.status === 'downloading') {
    return (
      <View
        testID={`download-badge-${postId}`}
        style={styles.badge}
        accessible
        accessibilityLabel={downloadingLabel(state.progress)}
      >
        <ActivityIndicator size="small" color={BADGE_TINT} />
        {state.progress === null ? null : (
          <Text style={styles.percent}>{downloadPercent(state.progress)}</Text>
        )}
      </View>
    );
  }
  if (state.status === 'downloaded') {
    return (
      <View
        testID={`download-badge-${postId}`}
        style={styles.badge}
        accessible
        accessibilityLabel="Downloaded"
      >
        <SymbolView name={DOWNLOADED_ICON} size={ICON_SIZE} tintColor={BADGE_TINT} />
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  percent: {
    color: BADGE_TINT,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
