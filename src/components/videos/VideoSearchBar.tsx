import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { useThemeColor } from '@/shared';

interface VideoSearchBarProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  /** Clears the query and collapses the bar. */
  readonly onClose: () => void;
}

function ClearButton({
  onChangeText,
  color,
}: Readonly<{ onChangeText: (text: string) => void; color: string }>): ReactElement {
  return (
    <Pressable
      testID="video-search-clear"
      onPress={() => {
        onChangeText('');
      }}
      accessibilityRole="button"
      accessibilityLabel="Clear search"
      hitSlop={8}
    >
      <SymbolView
        name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}
        size={16}
        tintColor={color}
      />
    </Pressable>
  );
}

function SearchField({ value, onChangeText }: Omit<VideoSearchBarProps, 'onClose'>): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const fieldColor = useThemeColor({ light: '#f2f2f2', dark: '#222' }, 'background');
  return (
    <View style={[styles.field, { backgroundColor: fieldColor }]}>
      <SymbolView
        name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
        size={14}
        tintColor={mutedColor}
      />
      <TextInput
        testID="video-search-input"
        style={[styles.input, { color: textColor }]}
        value={value}
        onChangeText={onChangeText}
        placeholder="Search videos"
        placeholderTextColor={mutedColor}
        autoFocus
        returnKeyType="search"
        accessibilityLabel="Search videos"
      />
      {value === '' ? null : <ClearButton onChangeText={onChangeText} color={mutedColor} />}
    </View>
  );
}

/** Expandable search field for the Videos feed; typing debounces into the API's `search` param. */
export function VideoSearchBar({
  value,
  onChangeText,
  onClose,
}: VideoSearchBarProps): ReactElement {
  const mutedColor = useThemeColor({}, 'icon');

  return (
    <View style={styles.row}>
      <SearchField value={value} onChangeText={onChangeText} />
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close search"
        hitSlop={8}
      >
        <Text style={[styles.cancel, { color: mutedColor }]}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
  },
  cancel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
