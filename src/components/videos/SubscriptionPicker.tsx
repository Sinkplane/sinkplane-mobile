import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';

import { useThemeColor, type Creator } from '@/shared';

const ALL_LABEL = 'All Subscriptions';
const GLOBE_ICON = { ios: 'globe', android: 'public', web: 'public' } as const;

interface SubscriptionPickerProps {
  creators: Creator[];
  /** Undefined = the merged feed across every subscription. */
  selectedCreatorId?: string;
  onSelect: (creatorId: string | undefined) => void;
}

/**
 * Toolbar control that picks which subscription the Videos feed shows: one creator,
 * or "All Subscriptions" merged across all of them (the floatplane.com home view).
 */
export function SubscriptionPicker({ creators, selectedCreatorId, onSelect }: SubscriptionPickerProps) {
  const [open, setOpen] = useState(false);

  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const sheetColor = useThemeColor({ light: '#ffffff', dark: '#1c1c1e' }, 'background');
  const idleColor = useThemeColor({ light: '#f2f2f2', dark: '#222' }, 'background');

  const selected = creators.find(creator => creator.id === selectedCreatorId);
  const label = selected?.title ?? ALL_LABEL;
    const choose = (creatorId: string | undefined) => {
    setOpen(false);
    if (creatorId !== selectedCreatorId) onSelect(creatorId);
  };

  return (
    <>
      <Pressable
        testID="subscription-picker"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.picker, { backgroundColor: idleColor }, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Subscription: ${label}. Tap to change.`}
      >
        {selected?.icon?.path ? (
          <Image source={selected.icon.path} style={styles.pickerIcon} />
        ) : (
          <SymbolView name={GLOBE_ICON} size={16} tintColor={mutedColor} />
        )}
        <Text style={[styles.pickerText, { color: textColor }]} numberOfLines={1}>
          {label}
        </Text>
        <SymbolView name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} size={14} tintColor={mutedColor} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} testID="subscription-modal-backdrop">
          <View style={[styles.sheet, { backgroundColor: sheetColor }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: textColor }]}>Subscriptions</Text>
            <Option
              testID="subscription-option-all"
              label={ALL_LABEL}
              selected={selectedCreatorId === undefined}
              icon={<SymbolView name={GLOBE_ICON} size={22} tintColor={mutedColor} />}
              onPress={() => choose(undefined)}
            />
            {creators.map(creator => (
              <Option
                key={creator.id}
                testID={`subscription-option-${creator.id}`}
                label={creator.title}
                selected={creator.id === selectedCreatorId}
                icon={
                  creator.icon?.path ? (
                    <Image source={creator.icon.path} style={styles.optionIcon} />
                  ) : (
                    <SymbolView name={GLOBE_ICON} size={22} tintColor={mutedColor} />
                  )
                }
                onPress={() => choose(creator.id)}
              />
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function Option({
  testID,
  label,
  selected,
  icon,
  onPress,
}: {
  testID: string;
  label: string;
  selected: boolean;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  const textColor = useThemeColor({}, 'text');
  const tintColor = useThemeColor({}, 'tint');

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Show ${label}`}
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
    >
      {icon}
      <Text style={[styles.optionLabel, { color: textColor }]} numberOfLines={1}>
        {label}
      </Text>
      {selected ? <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={18} tintColor={tintColor} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    minWidth: 120,
    flexShrink: 1,
  },
  pickerIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  pickerText: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 8,
    paddingBottom: 32,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128, 128, 128, 0.4)',
    marginTop: 8,
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginLeft: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  optionIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  optionLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.7,
  },
});
