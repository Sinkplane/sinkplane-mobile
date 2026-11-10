/**
 * The fixture world (user, creators, channels, subscriptions, feed videos, watch history), re-exported
 * by `@test/fixtures` — import from there.
 *
 * The world:
 *  - 1 user (testuser)
 *  - 2 subscriptions → "Tech Channel" (channels: Main + Side) and "Gaming Channel" (channel: Main)
 *  - a Tech Channel livestream (LIVESTREAM_ID), offline unless a test starts it; Gaming has none
 *  - 13 videos per channel, one per day going back from FIXED_NOW, so the creator-wide feed
 *    interleaves channels and paginates (page size 20) while a single channel fits one page.
 */

import type { Channel, ContentHistoryEntry, Creator, Subscription, User, Video } from '@/shared';

/** The clock every test runs against (relative dates are computed from it). */
export const FIXED_NOW = new Date('2026-10-28T12:00:00.000Z');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const VIDEOS_PER_CHANNEL = 13;

/** An image resource at a CDN path (fits every Floatplane image field the fixtures fill). */
interface FixtureImage {
  width: number;
  height: number;
  path: string;
  childImages: never[];
}

export const image = (path: string): FixtureImage => ({
  width: 1280,
  height: 720,
  path: `https://cdn.floatplane.test/${path}`,
  childImages: [],
});

export const fixtureUser: User = {
  id: 'user-1',
  username: 'testuser',
  displayName: 'Test User',
  profileImage: image('users/testuser/avatar.png'),
};

const makeChannel = (
  { id, creator }: { id: string; creator: string },
  title: string,
  order: number,
): Channel => ({
  id,
  creator,
  title,
  urlname: title.toLowerCase().replace(/\s+/g, '-'),
  about: `About ${title}`,
  order,
  cover: null,
  card: null,
  icon: image(`channels/${id}/icon.png`),
  socialLinks: {},
});

export const techMainChannel = makeChannel(
  { id: 'ch-tech-main', creator: 'creator-tech' },
  'Main Channel',
  0,
);
export const techSideChannel = makeChannel(
  { id: 'ch-tech-side', creator: 'creator-tech' },
  'Side Channel',
  1,
);
export const gamingMainChannel = makeChannel(
  { id: 'ch-gaming-main', creator: 'creator-gaming' },
  'Gaming Main',
  0,
);

export const LIVESTREAM_ID = '5c13f3c006f1be15e08e05c0';

export const techLiveStream: NonNullable<Creator['liveStream']> = {
  id: LIVESTREAM_ID,
  title: 'Tech Live: Friday Show',
  description: '<p>Live tech talk &amp; news</p>',
  thumbnail: image('live/tech/thumb.jpg'),
  owner: 'owner-creator-tech',
  channel: 'ch-tech-main',
  streamPath: '/live/tech',
  offline: {
    title: 'We are offline',
    description: '<p>Back Friday at 4pm</p>',
    thumbnail: image('live/tech/offline.jpg'),
  },
};

const makeCreator = (
  { id, title }: { id: string; title: string },
  channels: [Channel, ...Channel[]],
  liveStream?: Creator['liveStream'],
): Creator => ({
  id,
  owner: { id: `owner-${id}`, username: `${id}-owner` },
  title,
  urlname: title.toLowerCase().replace(/\s+/g, ''),
  description: `All about ${title}`,
  about: title,
  category: { id: 'cat-1', title: 'Tech' },
  cover: image(`creators/${id}/cover.jpg`),
  icon: image(`creators/${id}/icon.png`),
  card: image(`creators/${id}/card.jpg`),
  subscriptionPlans: [],
  discoverable: true,
  visibility: 'public',
  subscriberCountDisplay: '1K',
  incomeDisplay: false,
  defaultChannel: channels[0].id,
  socialLinks: {},
  channels,
  discordServers: [],
  ...(liveStream ? { liveStream } : {}),
});

export const techCreator = makeCreator(
  { id: 'creator-tech', title: 'Tech Channel' },
  [techMainChannel, techSideChannel],
  techLiveStream,
);
export const gamingCreator = makeCreator({ id: 'creator-gaming', title: 'Gaming Channel' }, [
  gamingMainChannel,
]);
export const fixtureCreators: Creator[] = [techCreator, gamingCreator];

const makeSubscription = (creator: Creator, planTitle: string): Subscription => ({
  startDate: '2025-01-01T00:00:00.000Z',
  endDate: '2027-01-01T00:00:00.000Z',
  paymentID: 1,
  interval: 'month',
  paymentCancelled: false,
  creator: creator.id,
  plan: {
    id: `plan-${creator.id}`,
    title: planTitle,
    description: '',
    price: '5.00',
    priceYearly: '50.00',
    currency: 'USD',
    logo: null,
    interval: 'month',
    featured: false,
    allowGrandfatheredAccess: false,
    discordServers: [],
    discordRoles: [],
    enabled: true,
    enabledGlobal: true,
  },
});

export const fixtureSubscriptions: Subscription[] = [
  makeSubscription(techCreator, 'Tech Supporter'),
  makeSubscription(gamingCreator, 'Gaming Supporter'),
];

export interface MakeVideoOptions {
  id?: string;
  title?: string;
  releaseDate?: string | null;
  duration?: number;
  likes?: number;
}

const videoMetadata = (duration: number): Video['metadata'] => ({
  hasVideo: true,
  videoCount: 1,
  videoDuration: duration,
  hasAudio: false,
  audioCount: 0,
  audioDuration: 0,
  hasPicture: false,
  pictureCount: 0,
  isFeatured: false,
  displayDuration: duration,
  hasGallery: false,
  galleryCount: 0,
});

/** `options` with every default filled in. */
function videoDefaults(channel: Channel, options: MakeVideoOptions): Required<MakeVideoOptions> {
  return {
    id: options.id ?? `${channel.id}-video`,
    title: options.title ?? `${channel.title} Video`,
    releaseDate: options.releaseDate === undefined ? FIXED_NOW.toISOString() : options.releaseDate,
    duration: options.duration ?? 600,
    likes: options.likes ?? 10,
  };
}

/** A video post as returned by /api/v3/content/creator. */
export function makeVideo(
  creator: Creator,
  channel: Channel,
  options: MakeVideoOptions = {},
): Video {
  const { id, title, releaseDate, duration, likes } = videoDefaults(channel, options);
  return {
    id,
    guid: id,
    title,
    text: `<p>Description for ${id}</p>`,
    textMarkdown: `Description for ${id}`,
    type: 'blogPost',
    channel,
    tags: [],
    attachmentOrder: [`${id}-attachment`],
    releaseDate,
    likes,
    dislikes: 0,
    score: 10,
    comments: 0,
    // The content API embeds the creator with channel ids rather than channel objects.
    creator: {
      ...creator,
      channels: creator.channels.map((c) => c.id),
    } as unknown as Video['creator'],
    wasReleasedSilently: false,
    metadata: videoMetadata(duration),
    galleryAttachments: [],
    selfUserInteraction: null,
    thumbnail: image(`videos/${id}/thumb.jpg`),
    isAccessible: true,
    videoAttachments: [`${id}-attachment`],
    audioAttachments: [],
    pictureAttachments: [],
  };
}

/**
 * VIDEOS_PER_CHANNEL videos for one channel, newest first. Channel `slot` offsets release times so
 * channels of the same creator interleave in the creator-wide feed (slot 0 is always newer).
 * "Main Channel Video 01" is released 1 day + slot hours before FIXED_NOW, "… 02" 2 days, …
 */
export function makeChannelVideos(creator: Creator, channel: Channel, slot = 0): Video[] {
  return Array.from({ length: VIDEOS_PER_CHANNEL }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return makeVideo(creator, channel, {
      id: `${channel.id}-${n}`,
      title: `${channel.title} Video ${n}`,
      releaseDate: new Date(FIXED_NOW.getTime() - (i + 1) * DAY_MS - slot * HOUR_MS).toISOString(),
      // Formatting probes on the newest video of each channel: 1:02:05 and 1.5K likes.
      duration: i === 0 ? 3725 : 600 + i,
      likes: i === 0 ? 1500 : i,
    });
  });
}

// ---------------------------------------------------------------------------
// Watch history — /api/v3/content/history fixtures.
// ---------------------------------------------------------------------------

/** A watch-history entry as returned by /api/v3/content/history (newest watch first). */
export function makeHistoryEntry(
  video: Video,
  progress: number,
  updatedAt = '2026-01-15T12:00:00.000Z',
): ContentHistoryEntry {
  return {
    userId: fixtureUser.id,
    contentId: video.id,
    contentType: 'blogPost',
    progress,
    updatedAt,
    blogPost: video,
  };
}
