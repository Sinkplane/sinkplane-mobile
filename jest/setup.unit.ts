import { items as secureStoreItems } from '@test/mocks/expo-secure-store';
import { resetMockVideoPlayerState } from '@test/mocks/expo-video';

beforeEach(() => {
  secureStoreItems.clear();
  resetMockVideoPlayerState();
});
