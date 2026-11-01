/**
 * Deterministic Floatplane fixtures shared by the unit and E2E suites.
 *
 * The world:
 *  - 1 user (testuser)
 *  - 2 subscriptions → "Tech Channel" (channels: Main + Side) and "Gaming Channel" (channel: Main)
 *  - 13 videos per channel, one per day going back from FIXED_NOW, so the creator-wide feed
 *    interleaves channels and paginates (page size 20) while a single channel fits one page.
 */

import type { Channel, ContentHistoryEntry, Creator, Subscription, User, Video, VideoDelivery, VideoPost } from '@/shared';
import type { PostComment } from '@/hooks/use-post-comments';

/** The clock every test runs against (relative dates are computed from it). */
export const FIXED_NOW = new Date('2026-10-28T12:00:00.000Z');

const DAY_MS = 24 * 60 * 60 * 1000;

export const VIDEOS_PER_CHANNEL = 13;

const image = (path: string) => ({
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

const makeChannel = (id: string, creator: string, title: string, order: number): Channel => ({
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

export const techMainChannel = makeChannel('ch-tech-main', 'creator-tech', 'Main Channel', 0);
export const techSideChannel = makeChannel('ch-tech-side', 'creator-tech', 'Side Channel', 1);
export const gamingMainChannel = makeChannel('ch-gaming-main', 'creator-gaming', 'Gaming Main', 0);

const makeCreator = (id: string, title: string, channels: Channel[]): Creator => ({
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
});

export const techCreator = makeCreator('creator-tech', 'Tech Channel', [techMainChannel, techSideChannel]);
export const gamingCreator = makeCreator('creator-gaming', 'Gaming Channel', [gamingMainChannel]);
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

/** A video post as returned by /api/v3/content/creator. */
export function makeVideo(creator: Creator, channel: Channel, options: MakeVideoOptions = {}): Video {
  const id = options.id ?? `${channel.id}-video`;
  return {
    id,
    guid: id,
    title: options.title ?? `${channel.title} Video`,
    text: `<p>Description for ${id}</p>`,
    textMarkdown: `Description for ${id}`,
    type: 'blogPost',
    channel,
    tags: [],
    attachmentOrder: [`${id}-attachment`],
    releaseDate: options.releaseDate === undefined ? FIXED_NOW.toISOString() : options.releaseDate,
    likes: options.likes ?? 10,
    dislikes: 0,
    score: 10,
    comments: 0,
    // The content API embeds the creator with channel ids rather than channel objects.
    creator: { ...creator, channels: creator.channels.map(c => c.id) } as unknown as Video['creator'],
    wasReleasedSilently: false,
    metadata: {
      hasVideo: true,
      videoCount: 1,
      videoDuration: options.duration ?? 600,
      hasAudio: false,
      audioCount: 0,
      audioDuration: 0,
      hasPicture: false,
      pictureCount: 0,
      isFeatured: false,
      displayDuration: options.duration ?? 600,
      hasGallery: false,
      galleryCount: 0,
    },
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
      releaseDate: new Date(FIXED_NOW.getTime() - (i + 1) * DAY_MS - slot * 60 * 60 * 1000).toISOString(),
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
export function makeHistoryEntry(video: Video, progress: number, updatedAt = '2026-01-15T12:00:00.000Z'): ContentHistoryEntry {
  return {
    userId: fixtureUser.id,
    contentId: video.id,
    contentType: 'blogPost',
    progress,
    updatedAt,
    blogPost: video,
  };
}

// ---------------------------------------------------------------------------
// Video page — /api/v3/content/post, /api/v3/delivery/info and /api/v3/comment fixtures.
// ---------------------------------------------------------------------------

/** A video attachment as embedded in a post (`GET /api/v3/content/post`). */
export function makeVideoAttachment(id: string, duration = 600): VideoPost['videoAttachments'][number] {
  return {
    id: `${id}-attachment`,
    guid: `${id}-guid`,
    title: `${id} attachment`,
    type: 'video',
    description: '',
    releaseDate: FIXED_NOW.toISOString(),
    duration,
    creator: 'creator-tech',
    likes: 0,
    dislikes: 0,
    score: 0,
    isProcessing: false,
    primaryBlogPost: id,
    levels: [],
    textTracks: [],
    selfUserInteraction: null,
    thumbnail: image(`videos/${id}/thumb.jpg`),
    isAccessible: true,
    blogPosts: [id],
    timelineSprite: { width: 0, height: 0, path: '', childImages: [] },
  };
}

export interface MakeVideoPostOptions {
  id?: string;
  title?: string;
  likes?: number;
  dislikes?: number;
  comments?: number;
  /** Watch position already saved for this user (post `progress` field). */
  progress?: number | null;
  /** The signed-in user's existing reaction (post `userInteraction` field). */
  userInteraction?: string[];
  /** `false` makes it an image/text post: the page shows the thumbnail instead of a player. */
  videoAttachments?: boolean;
}

/** A post as returned by `GET /api/v3/content/post?id=`, derived from a feed video. */
export function makeVideoPost(video: Video, options: MakeVideoPostOptions = {}): VideoPost {
  return {
    ...video,
    id: options.id ?? video.id,
    title: options.title ?? video.title,
    duration: video.metadata.videoDuration,
    likes: options.likes ?? video.likes,
    dislikes: options.dislikes ?? video.dislikes,
    comments: options.comments ?? 0,
    userInteraction: options.userInteraction ?? [],
    selfUserInteraction: null,
    progress: options.progress ?? null,
    videoAttachments: options.videoAttachments === false ? [] : [makeVideoAttachment(options.id ?? video.id, video.metadata.videoDuration)],
    // The post embeds the channel object; the feed video's creator only carries channel ids.
    creator: { ...video.creator, channels: [] } as unknown as VideoPost['creator'],
  } as unknown as VideoPost;
}

/** A delivery info payload for a video attachment guid: origin + ascending-quality variants. */
export function makeVideoDelivery(guid: string, { playable = true }: { playable?: boolean } = {}): VideoDelivery {
  const variants = playable
    ? [
        { url: `/${guid}/360.m3u8`, label: '360p', enabled: true, order: 0 },
        { url: `/${guid}/720.m3u8`, label: '720p', enabled: true, order: 1 },
        { url: `/${guid}/1080.m3u8`, label: '1080p', enabled: true, order: 2 },
      ]
    : [
        { url: `/${guid}/360.m3u8`, label: '360p', enabled: false },
        { url: `/${guid}/720.m3u8`, label: '720p', meta: { common: { access: { deniedReason: 'notSubscribed' } } } },
      ];
  return {
    groups: [
      {
        id: `${guid}-group`,
        label: 'hls',
        origins: [{ id: `${guid}-origin`, url: `https://edge.floatplane.test/${guid}/` }],
        variants,
      },
    ],
  } as VideoDelivery;
}

/** `count` comments for a post, oldest first; the first has an avatar and replies. */
export function makeComments(postId: string, count: number): PostComment[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${postId}-comment-${i + 1}`,
    blogPost: postId,
    user: {
      id: `commenter-${i + 1}`,
      username: `commenter${i + 1}`,
      profileImage: i === 0 ? { path: `https://cdn.floatplane.test/users/commenter-${i + 1}.png` } : null,
    },
    text: `Comment number ${i + 1} on ${postId}`,
    postDate: new Date(FIXED_NOW.getTime() - (i + 1) * 60_000).toISOString(),
    editDate: null,
    likes: i,
    dislikes: 0,
    totalReplies: i === 0 ? 2 : 0,
  }));
}
