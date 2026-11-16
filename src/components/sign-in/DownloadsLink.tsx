import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';

import { SIGN_IN_COLORS } from '@/components/sign-in/sign-in-theme';
import { useDownloadedVideos } from '@/hooks/use-video-download';

/**
 * Signed out (an offline launch signs out too), downloaded videos stay watchable: a link to the
 * Downloads list under the form. Nothing when there are none.
 */
export function DownloadsLink(): ReactElement | null {
  const router = useRouter();
  const count = useDownloadedVideos().length;
  if (count === 0) {
    return null;
  }
  return (
    <Pressable
      testID="sign-in-downloads"
      onPress={() => {
        router.push('/downloads');
      }}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}
      accessibilityRole="link"
    >
      <Text style={styles.text}>{`Watch downloaded videos (${String(count)})`}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: {
    alignSelf: 'center',
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  pressed: {
    opacity: 0.7,
  },
  text: {
    color: SIGN_IN_COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
});
