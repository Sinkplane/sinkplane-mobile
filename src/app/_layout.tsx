import { logError } from '@/utils/log';
import { useEffect, type ReactElement } from 'react';
import { Appearance, Platform, StyleSheet, View } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { isPlayerRoute, MiniPlayer } from '@/components/player/MiniPlayer';
import { PlaybackProvider } from '@/components/player/PlaybackSession';
import { lockAppOrientation } from '@/hooks/use-fullscreen-orientation';
import { useNotificationSync } from '@/hooks/use-notification-sync';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { configureNotifications } from '@/notifications/local-notifications';
import {
  SessionProvider,
  ThemeProvider as AppThemeProvider,
  useColorScheme,
  useSession,
  useTheme,
} from '@/shared';

// Prevent the splash screen from auto-hiding before the first render is ready.
void SplashScreen.preventAutoHideAsync();

// Show new-post notifications in the foreground too, and create the Android channel.
configureNotifications().catch((error: unknown) => {
  logError('[Notifications] Setup failed:', error);
});

// Create a query client instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout(): ReactElement {
  return (
    <AppThemeProvider>
      <RootNavigation />
    </AppThemeProvider>
  );
}

// Inner component so the navigation theme reacts to the app theme override.
function RootNavigation(): ReactElement {
  const colorScheme = useColorScheme();
  const { themeMode } = useTheme();

  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  useAppOrientation();

  // Push the in-app override down to the native layer so system-drawn chrome
  // (native tab bar / Liquid Glass, keyboards, alerts, WebViews) matches it.
  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }
    Appearance.setColorScheme(themeMode === 'system' ? 'auto' : themeMode);
  }, [themeMode]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <SessionProvider>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          <RootNavigator />
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/**
 * app.json allows every orientation so the fullscreen player can rotate. Phones are otherwise
 * portrait-only; tablets rotate everywhere. Player pages manage the orientation themselves while
 * they're showing (see useFullscreenOrientation), so a window resize under one (folding a foldable)
 * doesn't override them.
 */
function useAppOrientation(): void {
  const { large } = useScreenLayout();
  const onPlayerPage = isPlayerRoute(usePathname());
  useEffect(() => {
    if (!onPlayerPage) {
      lockAppOrientation(large);
    }
  }, [large, onPlayerPage]);
}

// Create a new component that can access the SessionProvider context.
function RootNavigator(): ReactElement {
  const { token, isLoading } = useSession();
  const signedIn = token !== null && token !== undefined && token !== '';

  useNotificationSync(token, isLoading);

  // The playback session outlives the player pages (mini player); signing out stops it.
  return (
    <PlaybackProvider active={signedIn}>
      <View style={styles.root}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="video/[id]" />
            <Stack.Screen name="live/[id]" />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
          <Stack.Screen name="+not-found" />
        </Stack>
        <MiniPlayer />
      </View>
    </PlaybackProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
