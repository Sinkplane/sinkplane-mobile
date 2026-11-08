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
 * The player page's locks. On iOS, DEFAULT means "all but upside down" and PORTRAIT_UP only allows
 * one way up, so a foldable stood up the other way (iPhone Duo rotated right from landscape, half
 * folded into tabletop) wouldn't flip and the controls would land on the upright half. Where the
 * device can go upside down, allow both portrait directions. It must be asked: iPhones with a
 * notch / Dynamic Island can't, and expo-screen-orientation then *rejects* ALL / PORTRAIT outright
 * (the previous lock stays, so the page would never rotate). Android keeps the system-respecting
 * locks: ALL / PORTRAIT use the sensor even when the user has turned auto-rotate off (and its
 * tabletop is landscape anyway).
 */
async function pageLocks() {
  const bothWays = Platform.OS === 'ios' && (await ScreenOrientation.supportsOrientationLockAsync(OrientationLock.ALL).catch(() => false));
  return {
    followDevice: bothWays ? OrientationLock.ALL : OrientationLock.DEFAULT,
    portrait: bothWays ? OrientationLock.PORTRAIT : OrientationLock.PORTRAIT_UP,
  };
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
    // A newer state (or leaving the page) supersedes a lock still waiting on the support check.
    let current = true;
    void pageLocks().then(locks => {
      if (!current) return;
      const lock = followDevice ? locks.followDevice : fullscreen ? OrientationLock.LANDSCAPE : locks.portrait;
      ScreenOrientation.lockAsync(lock).catch(() => {});
    });
    return () => {
      current = false;
    };
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
