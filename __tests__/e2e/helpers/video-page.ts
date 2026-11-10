/**
 * Shared steps of the video page E2E suites (video*.e2e.test.tsx): open the first Tech Main video
 * from the feed, wait until it is playable, and drive its fake player.
 */
import type { Video } from '@/shared';
import { techMainChannel } from '@test/fixtures';
import type { MockVideoPlayer } from '@test/mocks/expo-video';

import type { Runtime } from './runtime';

export const POST_ID = 'ch-tech-main-01';
export const GUID = `${POST_ID}-guid`;

/** `value`, or a thrown error naming what was missing (instead of a non-null assertion). */
export function defined<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${what} to be defined`);
  }
  return value;
}

/** Open the first Tech Main video from the feed (in-app navigation, like a real user). */
export async function openVideo(rt: Runtime, id = POST_ID): Promise<void> {
  rt.seedSession();
  await rt.renderApp();
  await rt.until(() => {
    expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();
  });
  await rt.fireEvent.press(rt.screen.getByTestId(`video-list-item-${id}`));
  await rt.until(() => {
    expect(rt.screen.getByTestId('video-screen')).toBeTruthy();
  });
}

/** Wait for the page to be playable: post + delivery fetched and the player mounted. */
export async function untilPlayable(rt: Runtime, id = POST_ID): Promise<void> {
  await rt.until(() => {
    expect(rt.screen.getByTestId('video-player')).toBeTruthy();
  });
  await rt.until(() => {
    expect(rt.screen.getByTestId('video-title')).toBeTruthy();
  });
  expect(rt.api.requestsTo('/api/v3/content/post')[0]?.params.get('id')).toBe(id);
}

/** The most recently created fake player. */
export const player = (rt: Runtime): MockVideoPlayer => rt.mockVideoPlayerState.lastPlayer();

/** The newest Tech Main feed video (what POST_ID's post is derived from). */
export const firstTechVideo = (rt: Runtime): Video =>
  defined(rt.api.channelVideos(techMainChannel.id)[0], 'the first Tech Main video');

/** The player reports a playback position (`timeUpdate`). */
export async function emitTimeUpdate(
  rt: Runtime,
  currentTime: number,
  bufferedPosition: number,
): Promise<void> {
  await rt.act(() => {
    player(rt).emit('timeUpdate', {
      currentTime,
      bufferedPosition,
      currentLiveTimestamp: null,
      currentOffsetFromLive: null,
    });
  });
}

/** The stream becomes playable (autoplay: resume → play). */
export async function readyToPlay(rt: Runtime): Promise<void> {
  await rt.act(() => {
    player(rt).setStatus('readyToPlay');
  });
}
