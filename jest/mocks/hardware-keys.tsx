/**
 * Stand-in for the local `@modules/hardware-keys` native view (mapped in jest.config.base.js): a
 * host View tests can find by testID and "press space" on with `fireEvent(view, 'space')`.
 */
import { View } from 'react-native';

import type { SpaceKeyListenerProps } from '../../modules/hardware-keys';

export function SpaceKeyListener({
  onSpace,
  active = true,
}: Readonly<SpaceKeyListenerProps>): React.JSX.Element {
  return (
    <View testID="space-key-listener" accessibilityState={{ disabled: !active }} {...{ onSpace }} />
  );
}
