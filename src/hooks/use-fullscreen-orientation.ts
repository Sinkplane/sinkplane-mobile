import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

const { Orientation, OrientationLock } = ScreenOrientation;

/**
 * The app-wide orientation outside a player page: phones are portrait-only, tablets (large
 * windows) rotate freely. `DEFAULT` lets the OS follow the orientations app.json allows.
 */
export function lockAppOrientation(largeScreen: boolean) {
  if (Platform.OS === 'web') return;
  ScreenOrientation.lockAsync(largeScreen ? OrientationLock.DEFAULT : OrientationLock.PORTRAIT_UP).catch(() => {});
}

/**
 * Fullscreen state for a player page.
 *
 * On phones, while `autoRotate` is on, the player follows the device: turning it sideways enters
 * fullscreen and turning it back upright leaves it. Once the user toggles fullscreen themselves
 * (player button, Android back), the screen stays locked to their choice for the rest of the visit:
 * a locked screen reports no rotations, so there is no way to tell when the device is held the
 * "right" way again to hand control back to the sensor.
 *
 * On large screens the page lays itself out for either orientation, so rotating never toggles
 * fullscreen and fullscreen never locks the orientation.
 */
export function useFullscreenOrientation(autoRotate: boolean, largeScreen = false) {
  const [rotatedOrChosen, setFullscreenState] = useState(false);
  const [userChose, setUserChose] = useState(false);
  const followDevice = autoRotate && !userChose && !largeScreen && Platform.OS !== 'web';
  // Rotation-driven fullscreen doesn't carry over to a large window (a phone unfolding into a tablet).
  const fullscreen = largeScreen && !userChose ? false : rotatedOrChosen;

  const setFullscreen = useCallback((next: boolean) => {
    setUserChose(true);
    setFullscreenState(next);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (largeScreen) {
      lockAppOrientation(true);
      return;
    }
    const lock = followDevice ? OrientationLock.DEFAULT : fullscreen ? OrientationLock.LANDSCAPE : OrientationLock.PORTRAIT_UP;
    ScreenOrientation.lockAsync(lock).catch(() => {});
  }, [followDevice, fullscreen, largeScreen]);

  // Leaving the page hands the orientation back to the app-wide policy.
  useEffect(() => () => lockAppOrientation(largeScreen), [largeScreen]);

  useEffect(() => {
    if (!followDevice) return;
    let rotated = false;
    const follow = (orientation: ScreenOrientation.Orientation) => {
      if (orientation === Orientation.UNKNOWN) return;
      setFullscreenState(orientation === Orientation.LANDSCAPE_LEFT || orientation === Orientation.LANDSCAPE_RIGHT);
    };
    const subscription = ScreenOrientation.addOrientationChangeListener(({ orientationInfo: { orientation } }) => {
      rotated = true;
      follow(orientation);
    });
    // Start from the current orientation: rotations went unheard while not following (e.g. a
    // foldable that was unfolded into a large window, rotated, then folded again).
    ScreenOrientation.getOrientationAsync()
      .then(orientation => {
        if (!rotated) follow(orientation);
      })
      .catch(() => {});
    return () => {
      rotated = true;
      subscription.remove();
    };
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
