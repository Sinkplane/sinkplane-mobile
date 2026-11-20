/**
 * Deterministic Floatplane fixtures shared by the unit and E2E suites (alias `@test/fixtures`).
 * The world (user, creators, channels, feed, history) lives in fixtures-world.ts; video page and
 * livestream payloads in fixtures-video-page.ts.
 */
export {
  FIXED_NOW,
  LIVESTREAM_ID,
  fixtureCreators,
  fixtureSubscriptions,
  fixtureUser,
  gamingCreator,
  gamingMainChannel,
  makeChannel,
  makeChannelVideos,
  makeCreator,
  makeHistoryEntry,
  makeSubscription,
  makeVideo,
  techCreator,
  techLiveStream,
  techMainChannel,
  techSideChannel,
} from './fixtures-world';
export {
  DOWNLOAD_SIZE_1080,
  DOWNLOAD_SIZE_720,
  makeComments,
  makeDownloadDelivery,
  makeCreatorLiveStream,
  makeLiveDelivery,
  makeVideoDelivery,
  makeVideoPost,
} from './fixtures-video-page';
