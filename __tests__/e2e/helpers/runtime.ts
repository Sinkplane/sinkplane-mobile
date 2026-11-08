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
type NotificationsMock = typeof import('@test/mocks/expo-notifications');
type TaskManagerMock = typeof import('@test/mocks/expo-task-manager');
type BackgroundTaskMock = typeof import('@test/mocks/expo-background-task');
type FoldPostureMock = typeof import('@test/mocks/fold-posture');
type SocketModule = typeof import('./mock-floatplane-socket');
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
  /** The in-memory sync socket server (push live notifications with `socket.notifyPostRelease`). */
  socket: SocketModule['socketServer'];
  /** expo-notifications mock: permission, presented notifications, taps. */
  notifications: NotificationsMock;
  /** expo-task-manager mock: defined/registered background tasks (`run` one like the OS would). */
  taskManager: TaskManagerMock['mockTaskManager'];
  backgroundTask: BackgroundTaskMock['mockBackgroundTask'];
  /** The foldable hinge (`set(...)` a posture to fold / unfold the device). */
  foldPosture: FoldPostureMock['mockFoldPosture'];
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
  const socketModule = jest.requireActual<SocketModule>('./mock-floatplane-socket');
  const utils = jest.requireActual<TestUtils>('./test-utils');
  const secureStore = jest.requireActual<SecureStoreMock>('@test/mocks/expo-secure-store');
  const videoMock = jest.requireActual<VideoMock>('@test/mocks/expo-video');
  const orientationMock = jest.requireActual<OrientationMock>('@test/mocks/expo-screen-orientation');
  const reactNative = jest.requireActual<ReactNative>('react-native');
  const notificationsMock = jest.requireActual<NotificationsMock>('@test/mocks/expo-notifications');
  const taskManagerMock = jest.requireActual<TaskManagerMock>('@test/mocks/expo-task-manager');
  const backgroundTaskMock = jest.requireActual<BackgroundTaskMock>('@test/mocks/expo-background-task');
  const foldPostureMock = jest.requireActual<FoldPostureMock>('@test/mocks/fold-posture');

  jest.spyOn(reactNative.BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    backHandlers.push(handler as () => boolean | null | undefined);
    return { remove: () => {} };
  });

  apiModule.api.reset();
  socketModule.socketServer.reset();
  notificationsMock.mockNotifications.reset();
  taskManagerMock.mockTaskManager.reset();
  backgroundTaskMock.mockBackgroundTask.reset();
  foldPostureMock.mockFoldPosture.reset();
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
    socket: socketModule.socketServer,
    notifications: notificationsMock,
    taskManager: taskManagerMock.mockTaskManager,
    backgroundTask: backgroundTaskMock.mockBackgroundTask,
    foldPosture: foldPostureMock.mockFoldPosture,
    backHandlers,
  } as Runtime;
  // RNTL reassigns `screen` on every render, so read it live. (A getter in the object literal
  // would be flattened by babel's spread downleveling; defineProperty keeps a real accessor.)
  Object.defineProperty(runtime, 'screen', { get: () => utils.screen, enumerable: true, configurable: true });
  return runtime;
}
