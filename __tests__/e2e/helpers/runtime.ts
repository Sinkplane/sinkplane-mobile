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

import type * as TestUtilsModule from './test-utils';
import type * as ApiExports from './mock-floatplane-api';
import type * as NativeMocksModule from './native-mocks';
import type * as SecureStoreMockModule from '@test/mocks/expo-secure-store';
import type * as VideoMockModule from '@test/mocks/expo-video';
import type * as OrientationMockModule from '@test/mocks/expo-screen-orientation';
import type * as NotificationsMockModule from '@test/mocks/expo-notifications';
import type * as TaskManagerMockModule from '@test/mocks/expo-task-manager';
import type * as BackgroundTaskMockModule from '@test/mocks/expo-background-task';
import type * as FoldPostureMockModule from '@test/mocks/fold-posture';
import type * as WindowSizeHelperModule from '@test/window-size';
import type * as SocketExports from './mock-floatplane-socket';
import type * as ReactNativeModule from 'react-native';

type TestUtils = typeof TestUtilsModule;
type ApiModule = typeof ApiExports;
type NativeMocks = typeof NativeMocksModule;
type SecureStoreMock = typeof SecureStoreMockModule;
type VideoMock = typeof VideoMockModule;
type OrientationMock = typeof OrientationMockModule;
type NotificationsMock = typeof NotificationsMockModule;
type TaskManagerMock = typeof TaskManagerMockModule;
type BackgroundTaskMock = typeof BackgroundTaskMockModule;
type FoldPostureMock = typeof FoldPostureMockModule;
type WindowSizeHelper = typeof WindowSizeHelperModule;
type SocketModule = typeof SocketExports;
type ReactNative = typeof ReactNativeModule;

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
  backHandlers: ((event?: unknown) => boolean | null | undefined)[];
  /**
   * Resize the window (dp) every `useWindowDimensions` in the app under test reports — phone,
   * tablet, rotation. Call before `renderApp` to boot at that size; inside `rt.act(...)` mid-test
   * to rotate / fold / split the window under a mounted app.
   */
  setWindow: WindowSizeHelper['setTestWindow'];
};

export function loadRuntime(): Runtime {
  jest.clearAllTimers();
  jest.resetModules();

  /** Hardware-back subscriptions the app registered (iOS's BackHandler is a stub, so capture here). */
  const backHandlers: (() => boolean | null | undefined)[] = [];

  // Order matters: native mocks register their factories first, then the fetch mock installs,
  // then test-utils pulls in expo-router/testing-library (the instance every helper shares).
  const nativeMocks = jest.requireActual<NativeMocks>('./native-mocks');
  const apiModule = jest.requireActual<ApiModule>('./mock-floatplane-api');
  const socketModule = jest.requireActual<SocketModule>('./mock-floatplane-socket');
  const utils = jest.requireActual<TestUtils>('./test-utils');
  const secureStore = jest.requireActual<SecureStoreMock>('@test/mocks/expo-secure-store');
  const videoMock = jest.requireActual<VideoMock>('@test/mocks/expo-video');
  const orientationMock = jest.requireActual<OrientationMock>(
    '@test/mocks/expo-screen-orientation',
  );
  const reactNative = jest.requireActual<ReactNative>('react-native');
  const notificationsMock = jest.requireActual<NotificationsMock>('@test/mocks/expo-notifications');
  const taskManagerMock = jest.requireActual<TaskManagerMock>('@test/mocks/expo-task-manager');
  const backgroundTaskMock = jest.requireActual<BackgroundTaskMock>(
    '@test/mocks/expo-background-task',
  );
  const foldPostureMock = jest.requireActual<FoldPostureMock>('@test/mocks/fold-posture');
  const windowSize = jest.requireActual<WindowSizeHelper>('@test/window-size');

  jest.spyOn(reactNative.BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    backHandlers.push(handler as () => boolean | null | undefined);
    return { remove: () => undefined };
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
  // Every test starts on a phone window; `rt.setWindow(...)` resizes for tablet / rotation tests.
  // (Must run after the module reset above so it drives the registry this test will render with.)
  windowSize.resetTestWindow();

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
    setWindow: windowSize.setTestWindow,
    backHandlers,
  } as Runtime;
  // RNTL reassigns `screen` on every render, so read it live. (A getter in the object literal
  // would be flattened by babel's spread downleveling; defineProperty keeps a real accessor.)
  Object.defineProperty(runtime, 'screen', {
    get: () => utils.screen,
    enumerable: true,
    configurable: true,
  });
  return runtime;
}
