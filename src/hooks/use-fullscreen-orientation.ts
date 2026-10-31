import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

const { Orientation, OrientationLock } = ScreenOrientation;

/** The app is portrait-only outside the video page. */
export function lockPortrait() {
  if (Platform.OS === 'web') return;
  ScreenOrientation.lockAsync(OrientationLock.PORTRAIT_UP).catch(() => {});
}

/**
 * Fullscreen state for the video page. While `autoRotate` is on, the player follows the device:
 * turning it sideways enters fullscreen and turning it back upright leaves it. Once the user
 * toggles fullscreen themselves (player button, Android back), the screen stays locked to their
 * choice for the rest of the visit: a locked screen reports no rotations, so there is no way to
 * tell when the device is held the "right" way again to hand control back to the sensor.
 */
export function useFullscreenOrientation(autoRotate: boolean) {
  const [fullscreen, setFullscreenState] = useState(false);
  const [userChose, setUserChose] = useState(false);
  const followDevice = autoRotate && !userChose && Platform.OS !== 'web';

  const setFullscreen = useCallback((next: boolean) => {
    setUserChose(true);
    setFullscreenState(next);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const lock = followDevice ? OrientationLock.DEFAULT : fullscreen ? OrientationLock.LANDSCAPE : OrientationLock.PORTRAIT_UP;
    ScreenOrientation.lockAsync(lock).catch(() => {});
  }, [followDevice, fullscreen]);

  useEffect(() => lockPortrait, []);

  useEffect(() => {
    if (!followDevice) return;
    const subscription = ScreenOrientation.addOrientationChangeListener(({ orientationInfo: { orientation } }) => {
      if (orientation === Orientation.UNKNOWN) return;
      setFullscreenState(orientation === Orientation.LANDSCAPE_LEFT || orientation === Orientation.LANDSCAPE_RIGHT);
    });
    return () => subscription.remove();
  }, [followDevice]);

  useEffect(() => {
    if (!fullscreen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setFullscreen(false);
      return true;
    });
    return () => subscription.remove();
  }, [fullscreen, setFullscreen]);

  return { fullscreen, setFullscreen };
}
