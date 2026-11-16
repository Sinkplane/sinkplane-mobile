import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { useDownloadedVideos } from '@/hooks/use-video-download';
import { useThemeColor } from '@/shared';
import { downloadsSummary } from '@/utils/downloads-summary';

const CHEVRON: SymbolViewProps['name'] = {
  ios: 'chevron.right',
  android: 'chevron_right',
  web: 'chevron_right',
};
const ICON_SIZE = 16;

/** Settings › Downloads: how many videos are downloaded and their size; opens the Downloads list. */
export function DownloadsRow(): ReactElement {
  const router = useRouter();
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const summary = downloadsSummary(useDownloadedVideos());
  return (
    <Pressable
      testID="settings-downloads"
      onPress={() => {
        router.push('/downloads');
      }}
      style={({ pressed }) => [
        styles.card,
        { borderColor: `${mutedColor}22` },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Downloaded videos, ${summary}`}
    >
      <View style={styles.text}>
        <Text style={[styles.title, { color: textColor }]}>Downloaded videos</Text>
        <Text style={[styles.summary, { color: mutedColor }]}>{summary}</Text>
      </View>
      <SymbolView name={CHEVRON} size={ICON_SIZE} tintColor={mutedColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  pressed: {
    opacity: 0.7,
  },
  text: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  summary: {
    fontSize: 15,
  },
});
