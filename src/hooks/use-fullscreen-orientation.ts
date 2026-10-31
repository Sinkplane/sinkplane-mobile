import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

/** The app is portrait-only outside the fullscreen player. */
export function lockPortrait() {
  if (Platform.OS === 'web') return;
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
}

/**
 * Landscape while `fullscreen`, portrait otherwise (and after unmount). The Android back button
 * leaves fullscreen instead of the screen.
 */
export function useFullscreenOrientation(fullscreen: boolean, exitFullscreen: () => void) {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!fullscreen) {
      lockPortrait();
      return;
    }
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    return lockPortrait;
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      exitFullscreen();
      return true;
    });
    return () => subscription.remove();
  }, [fullscreen, exitFullscreen]);
}
