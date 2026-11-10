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
  makeChannelVideos,
  makeHistoryEntry,
  makeVideo,
  techCreator,
  techLiveStream,
  techMainChannel,
  techSideChannel,
} from './fixtures-world';
export {
  makeComments,
  makeCreatorLiveStream,
  makeLiveDelivery,
  makeVideoDelivery,
  makeVideoPost,
} from './fixtures-video-page';
