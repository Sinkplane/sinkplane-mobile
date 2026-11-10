import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { PLAYBACK_SPEEDS } from '@/components/player/constants';

interface SpeedMenuProps {
  visible: boolean;
  rate: number;
  onSelect: (rate: number) => void;
  onClose: () => void;
}

const CHECK_ICON_SIZE = 18;

export const formatRate = (rate: number): string => (rate === 1 ? 'Normal' : `${String(rate)}×`);

function SpeedOption({
  speed,
  selected,
  onSelect,
}: Readonly<{ speed: number; selected: boolean; onSelect: (rate: number) => void }>) {
  return (
    <Pressable
      testID={`speed-option-${String(speed)}`}
      onPress={() => {
        onSelect(speed);
      }}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <View style={styles.check}>
        {selected ? (
          <SymbolView
            name={{ ios: 'checkmark', android: 'check', web: 'check' }}
            size={CHECK_ICON_SIZE}
            tintColor="#fff"
          />
        ) : null}
      </View>
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
        {formatRate(speed)}
      </Text>
    </Pressable>
  );
}

/** Bottom sheet listing the playback speeds; works in fullscreen landscape too. */
export function SpeedMenu({
  visible,
  rate,
  onSelect,
  onClose,
}: Readonly<SpeedMenuProps>): React.JSX.Element {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={onClose}
    >
      <Pressable
        testID="speed-menu-backdrop"
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel="Close speed menu"
      >
        <View style={styles.sheet}>
          <Text style={styles.heading}>Playback speed</Text>
          {PLAYBACK_SPEEDS.map((speed) => (
            <SpeedOption key={speed} speed={speed} selected={speed === rate} onSelect={onSelect} />
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    paddingTop: 16,
    paddingBottom: 32,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: '#1f2123',
  },
  heading: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  pressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  check: {
    width: 32,
  },
  optionText: {
    color: '#fff',
    fontSize: 16,
  },
  optionTextSelected: {
    fontWeight: '700',
  },
});
