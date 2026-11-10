import { useState, type ReactElement } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
} from 'react-native';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';

import { imagePath } from '@/components/image-path';
import { useThemeColor, type Creator } from '@/shared';

const ALL_LABEL = 'All Subscriptions';
const GLOBE_ICON = { ios: 'globe', android: 'public', web: 'public' } as const;

interface SubscriptionPickerProps {
  readonly creators: Creator[];
  /** Undefined = the merged feed across every subscription. */
  readonly selectedCreatorId?: string | undefined;
  readonly onSelect: (creatorId: string | undefined) => void;
}

const PICKER_GLOBE_SIZE = 16;
const OPTION_GLOBE_SIZE = 22;

interface CreatorIconProps {
  /** The creator, or undefined for "All Subscriptions" (the globe). */
  readonly creator: Creator | undefined;
  readonly imageStyle: StyleProp<ImageStyle>;
  readonly globeSize: number;
}

/** The creator's icon, or a globe when there is none. */
function CreatorIcon({ creator, imageStyle, globeSize }: CreatorIconProps): ReactElement {
  const mutedColor = useThemeColor({}, 'icon');
  const iconPath = imagePath(creator?.icon);
  if (iconPath === undefined) {
    return <SymbolView name={GLOBE_ICON} size={globeSize} tintColor={mutedColor} />;
  }
  return <Image source={iconPath} style={imageStyle} />;
}

interface PickerButtonProps {
  readonly selected: Creator | undefined;
  readonly label: string;
  readonly onPress: () => void;
}

function PickerButton({ selected, label, onPress }: PickerButtonProps): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const idleColor = useThemeColor({ light: '#f2f2f2', dark: '#222' }, 'background');
  return (
    <Pressable
      testID="subscription-picker"
      onPress={onPress}
      style={({ pressed }) => [
        styles.picker,
        { backgroundColor: idleColor },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Subscription: ${label}. Tap to change.`}
    >
      <CreatorIcon
        creator={selected}
        imageStyle={styles.pickerIcon}
        globeSize={PICKER_GLOBE_SIZE}
      />
      <Text style={[styles.pickerText, { color: textColor }]} numberOfLines={1}>
        {label}
      </Text>
      <SymbolView
        name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
        size={14}
        tintColor={mutedColor}
      />
    </Pressable>
  );
}

interface PickerSheetProps extends Pick<SubscriptionPickerProps, 'creators' | 'selectedCreatorId'> {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onChoose: (creatorId: string | undefined) => void;
}

function SheetOptions({
  creators,
  selectedCreatorId,
  onChoose,
}: Omit<PickerSheetProps, 'visible' | 'onClose'>): ReactElement {
  return (
    <>
      <Option
        testID="subscription-option-all"
        label={ALL_LABEL}
        selected={selectedCreatorId === undefined}
        onPress={() => {
          onChoose(undefined);
        }}
      />
      {creators.map((creator) => (
        <Option
          key={creator.id}
          testID={`subscription-option-${creator.id}`}
          label={creator.title}
          selected={creator.id === selectedCreatorId}
          creator={creator}
          onPress={() => {
            onChoose(creator.id);
          }}
        />
      ))}
    </>
  );
}

function PickerSheet({
  creators,
  selectedCreatorId,
  visible,
  onClose,
  onChoose,
}: PickerSheetProps): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const sheetColor = useThemeColor({ light: '#ffffff', dark: '#1c1c1e' }, 'background');
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID="subscription-modal-backdrop">
        <View style={[styles.sheet, { backgroundColor: sheetColor }]}>
          <View style={styles.sheetHandle} />
          <Text style={[styles.sheetTitle, { color: textColor }]}>Subscriptions</Text>
          <SheetOptions
            creators={creators}
            selectedCreatorId={selectedCreatorId}
            onChoose={onChoose}
          />
        </View>
      </Pressable>
    </Modal>
  );
}

/**
 * Toolbar control that picks which subscription the Videos feed shows: one creator,
 * or "All Subscriptions" merged across all of them (the floatplane.com home view).
 */
export function SubscriptionPicker({
  creators,
  selectedCreatorId,
  onSelect,
}: SubscriptionPickerProps): ReactElement {
  const [open, setOpen] = useState(false);

  const selected = creators.find((creator) => creator.id === selectedCreatorId);
  const label = selected?.title ?? ALL_LABEL;
  const choose = (creatorId: string | undefined) => {
    setOpen(false);
    if (creatorId !== selectedCreatorId) {
      onSelect(creatorId);
    }
  };
  const close = () => {
    setOpen(false);
  };

  return (
    <>
      <PickerButton
        selected={selected}
        label={label}
        onPress={() => {
          setOpen(true);
        }}
      />
      <PickerSheet
        creators={creators}
        selectedCreatorId={selectedCreatorId}
        visible={open}
        onClose={close}
        onChoose={choose}
      />
    </>
  );
}

function Option({
  testID,
  label,
  selected,
  creator,
  onPress,
}: Readonly<{
  testID: string;
  label: string;
  selected: boolean;
  /** Whose icon to show; undefined for "All Subscriptions". */
  creator?: Creator;
  onPress: () => void;
}>): ReactElement {
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
      <CreatorIcon creator={creator} imageStyle={styles.optionIcon} globeSize={OPTION_GLOBE_SIZE} />
      <Text style={[styles.optionLabel, { color: textColor }]} numberOfLines={1}>
        {label}
      </Text>
      {selected ? (
        <SymbolView
          name={{ ios: 'checkmark', android: 'check', web: 'check' }}
          size={18}
          tintColor={tintColor}
        />
      ) : null}
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
