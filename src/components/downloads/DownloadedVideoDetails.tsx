import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { confirmDeleteDownload } from '@/components/downloads/download-menus';
import {
  SAVE_TO_PHOTOS_LABEL,
  SaveToPhotosStatus,
} from '@/components/downloads/SaveToPhotosStatus';
import { useSaveToPhotos } from '@/hooks/use-save-to-photos';
import { useThemeColor } from '@/shared';
import type { DownloadedVideo } from '@/utils/download-library';
import { downloadDetail } from '@/utils/downloads-summary';

const PILL_COLORS = { light: '#eceef0', dark: '#26292b' };

interface DetailsProps {
  readonly video: DownloadedVideo;
  /** Runs after the download was deleted (the page closes). */
  readonly onDeleted: () => void;
}

function ActionPill({
  testID,
  label,
  onPress,
  disabled = false,
}: Readonly<{ testID: string; label: string; onPress: () => void; disabled?: boolean }>) {
  const textColor = useThemeColor({}, 'text');
  const pillColor = useThemeColor(PILL_COLORS, 'background');
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: pillColor },
        (pressed || disabled) && styles.dimmed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Text style={[styles.pillLabel, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

/** Under the offline player: what was downloaded, plus Save to Photos and Delete. */
export function DownloadedVideoDetails({ video, onDeleted }: DetailsProps): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const { state, save } = useSaveToPhotos();
  return (
    <View testID="downloaded-video-details" style={styles.details}>
      <Text style={[styles.title, { color: textColor }]}>{video.title}</Text>
      {video.channel === undefined ? null : (
        <Text style={[styles.meta, { color: mutedColor }]}>{video.channel}</Text>
      )}
      <Text style={[styles.meta, { color: mutedColor }]}>
        {`Downloaded · ${downloadDetail(video)}`}
      </Text>
      <View style={styles.actions}>
        <ActionPill
          testID="downloaded-save-to-photos"
          label={SAVE_TO_PHOTOS_LABEL}
          disabled={state === 'saving'}
          onPress={() => {
            save(video);
          }}
        />
        <ActionPill
          testID="downloaded-delete"
          label="Delete download"
          onPress={() => {
            confirmDeleteDownload(video, onDeleted);
          }}
        />
      </View>
      <SaveToPhotosStatus state={state} />
    </View>
  );
}

const styles = StyleSheet.create({
  details: {
    padding: 16,
    gap: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  meta: {
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  dimmed: {
    opacity: 0.6,
  },
  pillLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
