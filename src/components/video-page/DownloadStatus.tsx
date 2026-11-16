import type { ReactElement } from 'react';
import { StyleSheet, Text } from 'react-native';

import type { VideoDownloadState } from '@/hooks/use-video-download';
import { useThemeColor } from '@/shared';

/** One line under the actions when a download failed. */
export function DownloadStatus({
  state,
}: Readonly<{ state: VideoDownloadState }>): ReactElement | null {
  const mutedColor = useThemeColor({}, 'icon');
  if (state.status !== 'failed') {
    return null;
  }
  return (
    <Text testID="download-status" style={[styles.status, { color: mutedColor }]}>
      {`Couldn't download ${state.label}. Try again.`}
    </Text>
  );
}

const styles = StyleSheet.create({
  status: {
    fontSize: 13,
  },
});
