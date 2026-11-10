import type { ReactElement } from 'react';
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useThemeColor } from '@/shared';

export default function NotFound(): ReactElement {
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Text style={[styles.title, { color: textColor }]}>This screen does not exist.</Text>
      <Link href="/" style={styles.link}>
        Go to home screen
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  link: {
    marginTop: 16,
    paddingVertical: 8,
  },
});
