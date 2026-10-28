import { useEffect } from 'react';
import { Appearance, Platform } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { SessionProvider, ThemeProvider as AppThemeProvider, useColorScheme, useSession, useTheme } from '@/shared';

// Prevent the splash screen from auto-hiding before the first render is ready.
SplashScreen.preventAutoHideAsync();

// Create a query client instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <RootNavigation />
    </AppThemeProvider>
  );
}

// Inner component so the navigation theme reacts to the app theme override.
function RootNavigation() {
  const colorScheme = useColorScheme();
  const { themeMode } = useTheme();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  // Push the in-app override down to the native layer so system-drawn chrome
  // (native tab bar / Liquid Glass, keyboards, alerts, WebViews) matches it.
  useEffect(() => {
    if (Platform.OS === 'web') return;
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

// Create a new component that can access the SessionProvider context.
function RootNavigator() {
  const { token } = useSession();
  const signedIn = !!token;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}
