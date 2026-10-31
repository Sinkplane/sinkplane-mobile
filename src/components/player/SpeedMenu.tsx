import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { PLAYBACK_SPEEDS } from '@/components/player/constants';

interface SpeedMenuProps {
  visible: boolean;
  rate: number;
  onSelect: (rate: number) => void;
  onClose: () => void;
}

export const formatRate = (rate: number) => (rate === 1 ? 'Normal' : `${rate}×`);

/** Bottom sheet listing the playback speeds; works in fullscreen landscape too. */
export function SpeedMenu({ visible, rate, onSelect, onClose }: SpeedMenuProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" supportedOrientations={['portrait', 'landscape']} onRequestClose={onClose}>
      <Pressable testID="speed-menu-backdrop" style={styles.backdrop} onPress={onClose} accessibilityLabel="Close speed menu">
        <View style={styles.sheet}>
          <Text style={styles.heading}>Playback speed</Text>
          {PLAYBACK_SPEEDS.map(speed => {
            const selected = speed === rate;
            return (
              <Pressable
                key={speed}
                testID={`speed-option-${speed}`}
                onPress={() => onSelect(speed)}
                style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <View style={styles.check}>
                  {selected ? <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={18} tintColor="#fff" /> : null}
                </View>
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{formatRate(speed)}</Text>
              </Pressable>
            );
          })}
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
