import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

const { Orientation, OrientationLock } = ScreenOrientation;

const ignoreLockError = (): void => undefined;

/**
 * The app-wide orientation outside a player page: phones are portrait-only, tablets (large
 * windows) rotate freely. `DEFAULT` lets the OS follow the orientations app.json allows.
 */
export function lockAppOrientation(largeScreen: boolean): void {
  if (Platform.OS === 'web') {
    return;
  }
  ScreenOrientation.lockAsync(
    largeScreen ? OrientationLock.DEFAULT : OrientationLock.PORTRAIT_UP,
  ).catch(ignoreLockError);
}

export interface FullscreenOrientation {
  fullscreen: boolean;
  setFullscreen: (next: boolean) => void;
}

interface OrientationPolicy {
  followDevice: boolean;
  fullscreen: boolean;
  largeScreen: boolean;
}

/** The phone lock while on a player page: free while following the device, else the chosen one. */
function phoneLock({
  followDevice,
  fullscreen,
}: OrientationPolicy): ScreenOrientation.OrientationLock {
  if (followDevice) {
    return OrientationLock.DEFAULT;
  }
  return fullscreen ? OrientationLock.LANDSCAPE : OrientationLock.PORTRAIT_UP;
}

/** Applies the page's orientation lock, and hands the app-wide one back when leaving the page. */
function useOrientationLock(policy: OrientationPolicy): void {
  const { followDevice, fullscreen, largeScreen } = policy;

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }
    if (largeScreen) {
      lockAppOrientation(true);
      return;
    }
    ScreenOrientation.lockAsync(phoneLock({ followDevice, fullscreen, largeScreen })).catch(
      ignoreLockError,
    );
  }, [followDevice, fullscreen, largeScreen]);

  // Leaving the page hands the orientation back to the app-wide policy.
  useEffect(
    () => () => {
      lockAppOrientation(largeScreen);
    },
    [largeScreen],
  );
}

const isLandscape = (orientation: ScreenOrientation.Orientation): boolean =>
  orientation === Orientation.LANDSCAPE_LEFT || orientation === Orientation.LANDSCAPE_RIGHT;

/** While `followDevice`, turning the device sideways / upright sets fullscreen on / off. */
function useFollowDeviceRotation(
  followDevice: boolean,
  setFullscreen: (next: boolean) => void,
): void {
  useEffect(() => {
    if (!followDevice) {
      return;
    }
    let rotated = false;
    const follow = (orientation: ScreenOrientation.Orientation) => {
      if (orientation !== Orientation.UNKNOWN) {
        setFullscreen(isLandscape(orientation));
      }
    };
    const subscription = ScreenOrientation.addOrientationChangeListener(
      ({ orientationInfo: { orientation } }) => {
        rotated = true;
        follow(orientation);
      },
    );
    // Start from the current orientation: rotations went unheard while not following (e.g. a
    // foldable that was unfolded into a large window, rotated, then folded again).
    ScreenOrientation.getOrientationAsync()
      .then((orientation) => {
        if (!rotated) {
          follow(orientation);
        }
      })
      .catch(ignoreLockError);
    return () => {
      rotated = true;
      subscription.remove();
    };
  }, [followDevice, setFullscreen]);
}

/** Android back leaves fullscreen instead of the page. */
function useBackLeavesFullscreen(
  fullscreen: boolean,
  setFullscreen: (next: boolean) => void,
): void {
  useEffect(() => {
    if (!fullscreen) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setFullscreen(false);
      return true;
    });
    return () => {
      subscription.remove();
    };
  }, [fullscreen, setFullscreen]);
}

/** Rotation drives fullscreen only on phones (not web), until the user picks it themselves. */
function shouldFollowDevice(
  autoRotate: boolean,
  userChose: boolean,
  largeScreen: boolean,
): boolean {
  return autoRotate && !userChose && !largeScreen && Platform.OS !== 'web';
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
export function useFullscreenOrientation(
  autoRotate: boolean,
  largeScreen = false,
): FullscreenOrientation {
  const [rotatedOrChosen, setFullscreenState] = useState(false);
  const [userChose, setUserChose] = useState(false);
  const followDevice = shouldFollowDevice(autoRotate, userChose, largeScreen);
  // Rotation-driven fullscreen doesn't carry over to a large window (a phone unfolding into a tablet).
  const fullscreen = rotatedOrChosen && (userChose || !largeScreen);

  const setFullscreen = useCallback((next: boolean) => {
    setUserChose(true);
    setFullscreenState(next);
  }, []);

  useOrientationLock({ followDevice, fullscreen, largeScreen });
  useFollowDeviceRotation(followDevice, setFullscreenState);
  useBackLeavesFullscreen(fullscreen, setFullscreen);

  return { fullscreen, setFullscreen };
}
