import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { useThemeColor } from '@/shared';

const BACK_ICON: SymbolViewProps['name'] = {
  ios: 'chevron.left',
  android: 'arrow_back',
  web: 'arrow_back',
};
const ICON_SIZE = 22;
const HIT_SLOP = 10;

/** Back to the previous screen; opened directly (nothing to go back to), to the app's start. */
export function useGoBack(): () => void {
  const router = useRouter();
  return () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };
}

/** A pushed screen's header: a back button and the title. */
export function ScreenHeader({ title }: Readonly<{ title: string }>): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const goBack = useGoBack();
  return (
    <View style={styles.header}>
      <Pressable
        testID="screen-back"
        onPress={goBack}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <SymbolView name={BACK_ICON} size={ICON_SIZE} tintColor={textColor} />
      </Pressable>
      <Text style={[styles.title, { color: textColor }]} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
});
