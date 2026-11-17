import { items as secureStoreItems } from '@test/mocks/expo-secure-store';
import { resetMockVideoPlayerState } from '@test/mocks/expo-video';
import { mockNotifications } from '@test/mocks/expo-notifications';
import { mockTaskManager } from '@test/mocks/expo-task-manager';
import { mockBackgroundTask } from '@test/mocks/expo-background-task';
import { mockFoldPosture } from '@test/mocks/fold-posture';
import { resetTestWindow } from '@test/window-size';
import { mockFileSystem } from '@test/mocks/expo-file-system';
import { mockMediaLibrary } from '@test/mocks/expo-media-library';
import { mockNetwork } from '@test/mocks/expo-network';

// Downloads: in-memory file system + photo library (see the mocks for the drivable state).
jest.mock('expo-file-system', () => jest.requireActual<object>('@test/mocks/expo-file-system'));
jest.mock('expo-media-library', () => jest.requireActual<object>('@test/mocks/expo-media-library'));
// Network state: drive it with `mockNetwork.set(...)` (unknown until then, like the real module).
jest.mock('expo-network', () => jest.requireActual<object>('@test/mocks/expo-network'));

beforeEach(() => {
  secureStoreItems.clear();
  resetMockVideoPlayerState();
  mockNotifications.reset();
  mockTaskManager.reset();
  mockBackgroundTask.reset();
  mockFoldPosture.reset();
  mockFileSystem.reset();
  mockMediaLibrary.reset();
  mockNetwork.reset();
  resetTestWindow();
});
