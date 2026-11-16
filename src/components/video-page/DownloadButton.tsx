import type { ReactElement } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { downloadingLabel } from '@/components/downloads/DownloadActionSheet';
import type { VideoDownloadState } from '@/hooks/use-video-download';
import { useThemeColor } from '@/shared';

interface DownloadButtonProps {
  readonly state: VideoDownloadState;
  /** Idle / failed: opens the quality list; downloaded: opens the actions menu. */
  readonly onPress: () => void;
  readonly onCancel: () => void;
}

const ICON_SIZE = 18;
const PILL_COLORS = { light: '#eceef0', dark: '#26292b' };

const DOWNLOAD_ICON: SymbolViewProps['name'] = {
  ios: 'arrow.down.circle',
  android: 'download',
  web: 'download',
};
const SAVED_ICON: SymbolViewProps['name'] = {
  ios: 'checkmark.circle',
  android: 'download_done',
  web: 'download_done',
};

/** What the pill says for each state. */
function downloadButtonLabel(state: VideoDownloadState): string {
  switch (state.status) {
    case 'downloading':
      return downloadingLabel(state.progress);
    case 'downloaded':
      return 'Downloaded';
    default:
      return 'Download';
  }
}

function ButtonIcon({ state }: Readonly<{ state: VideoDownloadState }>): ReactElement {
  const textColor = useThemeColor({}, 'text');
  if (state.status === 'downloading') {
    return <ActivityIndicator testID="download-spinner" size="small" color={textColor} />;
  }
  return (
    <SymbolView
      testID="download-icon"
      name={state.status === 'downloaded' ? SAVED_ICON : DOWNLOAD_ICON}
      size={ICON_SIZE}
      tintColor={textColor}
    />
  );
}

/** Download pill next to the reactions; while a download runs it shows progress plus Cancel. */
export function DownloadButton({ state, onPress, onCancel }: DownloadButtonProps): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const pillColor = useThemeColor(PILL_COLORS, 'background');
  const busy = state.status === 'downloading';
  const label = downloadButtonLabel(state);
  return (
    <View style={styles.row}>
      <Pressable
        testID="download-button"
        onPress={onPress}
        disabled={busy}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: pillColor },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: busy, busy }}
      >
        <ButtonIcon state={state} />
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      </Pressable>
      {state.status === 'downloading' ? (
        <Pressable
          testID="download-cancel"
          onPress={onCancel}
          style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Cancel download"
        >
          <Text style={[styles.label, { color: textColor }]}>Cancel</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  cancel: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pressed: {
    opacity: 0.6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
