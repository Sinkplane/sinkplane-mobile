/**
 * Native module mocks for the E2E suite.
 *
 * Each mock is a controllable stand-in: tests drive events into it (Turnstile messages) and inspect
 * what the app did with it. expo-secure-store, expo-video and expo-screen-orientation are mapped to
 * in-memory mocks for every suite (see jest.config.base.js; their per-test state is reset by
 * helpers/runtime.ts, which also exposes them as `rt.secureStore`, `rt.mockVideoPlayerState` and
 * `rt.orientation`). Everything not mocked here (navigation, native tabs, react-query, the
 * shared auth/session/theme providers, screens) runs as production code.
 *
 * Import this before any app module so the `jest.mock` factories register first.
 */

import type * as ReactModule from 'react';
import type * as ReactNativeModule from 'react-native';

/** Props the Turnstile widget passes to the native WebView. */
export interface MockWebViewProps {
  source?: { html: string; baseUrl?: string };
  userAgent?: string;
  onMessage?: (event: { nativeEvent: { data: string } }) => void;
  onError?: (event: { nativeEvent: { description?: string } }) => void;
}

// The `mock` prefix lets babel-plugin-jest-hoist reference these from the factories below.
export const mockWebViewState = { props: null as MockWebViewProps | null, mounts: 0 };

// ---------------------------------------------------------------------------
// react-native-webview — the Turnstile challenge renders as a plain View the tests can drive.
// ---------------------------------------------------------------------------

jest.mock('react-native-webview', () => {
  const React = jest.requireActual<typeof ReactModule>('react');
  const { View } = jest.requireActual<typeof ReactNativeModule>('react-native');

  function MockWebView(props: MockWebViewProps): ReactModule.ReactElement {
    mockWebViewState.props = props;
    React.useEffect(() => {
      mockWebViewState.mounts += 1;
    }, []);
    return React.createElement(View, { testID: 'turnstile-webview' });
  }

  // Keys assigned by name: the module's export names are not camelCase.
  const mockModule: Record<string, unknown> = { default: MockWebView };
  mockModule['__esModule'] = true;
  mockModule['WebView'] = MockWebView;
  return mockModule;
});

// ---------------------------------------------------------------------------
// expo-splash-screen
// ---------------------------------------------------------------------------

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve(true)),
  hide: jest.fn(),
  setOptions: jest.fn(),
}));
