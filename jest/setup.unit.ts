import { items as secureStoreItems } from '@test/mocks/expo-secure-store';
import { resetMockVideoPlayerState } from '@test/mocks/expo-video';
import { mockNotifications } from '@test/mocks/expo-notifications';
import { mockTaskManager } from '@test/mocks/expo-task-manager';
import { mockBackgroundTask } from '@test/mocks/expo-background-task';
import { mockFoldPosture } from '@test/mocks/fold-posture';

beforeEach(() => {
  secureStoreItems.clear();
  resetMockVideoPlayerState();
  mockNotifications.reset();
  mockTaskManager.reset();
  mockBackgroundTask.reset();
  mockFoldPosture.reset();
});
