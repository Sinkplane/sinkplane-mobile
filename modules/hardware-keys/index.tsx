import type { ComponentType } from 'react';
import { StyleSheet, type ViewProps } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';

interface NativeProps extends ViewProps {
  active: boolean;
  onSpace: () => void;
}

// Optional: absent on web, in Jest, and in dev builds made before this module was added.
const NativeSpaceKeyView: ComponentType<NativeProps> | null =
  requireOptionalNativeModule('HardwareKeys') === null
    ? null
    : requireNativeView<NativeProps>('HardwareKeys');

export interface SpaceKeyListenerProps {
  /** Called on every press of a hardware keyboard's space bar (no modifiers). */
  onSpace: () => void;
  /** Off while something else should get the keyboard; turning it back on re-takes it. */
  active?: boolean | undefined;
}

/**
 * Invisible: takes the hardware keyboard focus (first responder on iOS, view focus on Android)
 * and reports the space bar. React Native has no hardware key events on iOS, hence native code.
 */
export function SpaceKeyListener({
  onSpace,
  active = true,
}: Readonly<SpaceKeyListenerProps>): React.JSX.Element | null {
  if (NativeSpaceKeyView === null) {
    return null;
  }
  // No `pointerEvents="none"`: on iOS that disables user interaction, which also drops key presses.
  return (
    <NativeSpaceKeyView
      style={styles.hidden}
      active={active}
      onSpace={onSpace}
      accessible={false}
    />
  );
}

const styles = StyleSheet.create({
  // 1×1 rather than 0×0: Android won't focus a zero-size view. No background, so nothing shows; no
  // `opacity: 0` either, which UIKit may treat as hidden.
  hidden: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1,
    height: 1,
  },
});
