import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { useTheme, useThemeColor, type ThemeMode } from '@/shared';

const OPTIONS: { mode: ThemeMode; label: string; icon: SymbolViewProps['name'] }[] = [
  { mode: 'system', label: 'System', icon: { ios: 'circle.lefthalf.filled', android: 'contrast', web: 'contrast' } },
  { mode: 'light', label: 'Light', icon: { ios: 'sun.max.fill', android: 'light_mode', web: 'light_mode' } },
  { mode: 'dark', label: 'Dark', icon: { ios: 'moon.fill', android: 'dark_mode', web: 'dark_mode' } },
];

/**
 * Segmented System / Light / Dark picker backed by the shared ThemeProvider.
 * The choice is persisted in secure storage, so it survives restarts.
 */
export function ThemeSwitcher() {
  const { themeMode, setThemeMode } = useTheme();
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const trackColor = useThemeColor({ light: '#f2f2f2', dark: '#222' }, 'background');
  const selectedColor = useThemeColor({ light: '#fff', dark: '#3a3d40' }, 'background');

  return (
    <View style={[styles.track, { backgroundColor: trackColor }]} accessibilityRole="radiogroup">
      {OPTIONS.map(option => {
        const selected = option.mode === themeMode;
        const color = selected ? textColor : mutedColor;
        return (
          <Pressable
            key={option.mode}
            onPress={() => setThemeMode(option.mode)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option.label} theme`}
            style={[styles.segment, selected && [styles.segmentSelected, { backgroundColor: selectedColor }]]}
          >
            <SymbolView name={option.icon} size={18} tintColor={color} />
            <Text style={[styles.label, { color }, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 9,
  },
  segmentSelected: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  labelSelected: {
    fontWeight: '700',
  },
});
