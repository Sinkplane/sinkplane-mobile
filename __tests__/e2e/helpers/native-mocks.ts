/**
 * Native module mocks for the E2E suite.
 *
 * Each mock is a controllable stand-in: tests drive events into it (Turnstile messages) and inspect
 * what the app did with it. expo-secure-store is mapped to an in-memory store for every suite (see
 * jest.config.base.js). Everything not mocked here (navigation, native tabs, react-query, the
 * shared auth/session/theme providers, screens) runs as production code.
 *
 * Import this before any app module so the `jest.mock` factories register first.
 */

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
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  function MockWebView(props: MockWebViewProps) {
    mockWebViewState.props = props;
    React.useEffect(() => {
      mockWebViewState.mounts += 1;
    }, []);
    return React.createElement(View, { testID: 'turnstile-webview' });
  }

  return { __esModule: true, WebView: MockWebView, default: MockWebView };
});

// ---------------------------------------------------------------------------
// expo-splash-screen
// ---------------------------------------------------------------------------

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => true),
  hide: jest.fn(),
  setOptions: jest.fn(),
}));
