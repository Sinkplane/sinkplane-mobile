/**
 * Per-test runtime.
 *
 * The app holds module-level singletons that must be pristine for every test (expo-router's
 * router store, the QueryClient in src/app/_layout.tsx, the API client's refresh callback, …).
 * `jest.resetModules()` gives each test a fresh registry; this then re-requires the helpers from
 * that registry so tests never touch a stale module instance.
 *
 *   const rt = loadRuntime();
 *   rt.seedSession();
 *   await rt.renderApp();
 *   await rt.until(() => rt.screen.getByText('…'));
 */

type TestUtils = typeof import('./test-utils');
type ApiModule = typeof import('./mock-floatplane-api');
type NativeMocks = typeof import('./native-mocks');
type SecureStoreMock = typeof import('@test/mocks/expo-secure-store');
type VideoMock = typeof import('@test/mocks/expo-video');
type OrientationMock = typeof import('@test/mocks/expo-screen-orientation');
type ReactNative = typeof import('react-native');

export type Runtime = TestUtils & {
  api: ApiModule['api'];
  secureStore: SecureStoreMock['items'];
  /** Spy on the native appearance override the root layout applies. */
  setColorScheme: jest.SpiedFunction<ReactNative['Appearance']['setColorScheme']>;
  /** React Native's Linking (jest preset mocks openURL). */
  linking: ReactNative['Linking'];
  /** Recorded fake players/views from the mapped expo-video mock. */
  mockVideoPlayerState: VideoMock['mockVideoPlayerState'];
  /** The mapped expo-screen-orientation mock (assert orientation locks). */
  orientation: OrientationMock;
  /** Android hardware-back subscriptions captured while the app runs (press them to exit fullscreen). */
  backHandlers: Array<(event?: unknown) => boolean | null | undefined>;
};

export function loadRuntime(): Runtime {
  jest.clearAllTimers();
  jest.resetModules();

  /** Hardware-back subscriptions the app registered (iOS's BackHandler is a stub, so capture here). */
  const backHandlers: Array<() => boolean | null | undefined> = [];

  // Order matters: native mocks register their factories first, then the fetch mock installs,
  // then test-utils pulls in expo-router/testing-library (the instance every helper shares).
  const nativeMocks = jest.requireActual<NativeMocks>('./native-mocks');
  const apiModule = jest.requireActual<ApiModule>('./mock-floatplane-api');
  const utils = jest.requireActual<TestUtils>('./test-utils');
  const secureStore = jest.requireActual<SecureStoreMock>('@test/mocks/expo-secure-store');
  const videoMock = jest.requireActual<VideoMock>('@test/mocks/expo-video');
  const orientationMock = jest.requireActual<OrientationMock>('@test/mocks/expo-screen-orientation');
  const reactNative = jest.requireActual<ReactNative>('react-native');

  jest.spyOn(reactNative.BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    backHandlers.push(handler as () => boolean | null | undefined);
    return { remove: () => {} };
  });

  apiModule.api.reset();
  secureStore.items.clear();
  nativeMocks.mockWebViewState.props = null;
  nativeMocks.mockWebViewState.mounts = 0;
  videoMock.resetMockVideoPlayerState();
  backHandlers.length = 0;

  const runtime = {
    ...utils,
    api: apiModule.api,
    secureStore: secureStore.items,
    setColorScheme: jest.spyOn(reactNative.Appearance, 'setColorScheme'),
    linking: reactNative.Linking,
    mockVideoPlayerState: videoMock.mockVideoPlayerState,
    orientation: orientationMock,
    backHandlers,
  } as Runtime;
  // RNTL reassigns `screen` on every render, so read it live. (A getter in the object literal
  // would be flattened by babel's spread downleveling; defineProperty keeps a real accessor.)
  Object.defineProperty(runtime, 'screen', { get: () => utils.screen, enumerable: true, configurable: true });
  return runtime;
}
