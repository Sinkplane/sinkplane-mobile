/**
 * Video page and livestream fixtures (/api/v3/content/post, /api/v3/delivery/info,
 * /api/v3/comment), re-exported by `@test/fixtures` — import from there.
 */

import type { CreatorLiveStream } from '@/hooks/use-live-streams';
import type { PostComment } from '@/hooks/use-post-comments';
import type { Video, VideoDelivery, VideoPost } from '@/shared';

import { FIXED_NOW, image, LIVESTREAM_ID, techCreator, techLiveStream } from './fixtures-world';

/** A video attachment as embedded in a post (`GET /api/v3/content/post`). */
function makeVideoAttachment(id: string, duration = 600): VideoPost['videoAttachments'][number] {
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

/** The post's counters and the signed-in user's state, defaulted from the feed video. */
function postCounters(video: Video, options: MakeVideoPostOptions) {
  return {
    likes: options.likes ?? video.likes,
    dislikes: options.dislikes ?? video.dislikes,
    comments: options.comments ?? 0,
    userInteraction: options.userInteraction ?? [],
    progress: options.progress ?? null,
  };
}

/** A post as returned by `GET /api/v3/content/post?id=`, derived from a feed video. */
export function makeVideoPost(video: Video, options: MakeVideoPostOptions = {}): VideoPost {
  const id = options.id ?? video.id;
  return {
    ...video,
    id,
    title: options.title ?? video.title,
    duration: video.metadata.videoDuration,
    ...postCounters(video, options),
    selfUserInteraction: null,
    videoAttachments:
      options.videoAttachments === false
        ? []
        : [makeVideoAttachment(id, video.metadata.videoDuration)],
    // The post embeds the channel object; the feed video's creator only carries channel ids.
    creator: { ...video.creator, channels: [] } as unknown as VideoPost['creator'],
  } as unknown as VideoPost;
}

/** A delivery info payload for a video attachment guid: origin + ascending-quality variants. */
export function makeVideoDelivery(
  guid: string,
  { playable = true }: { playable?: boolean } = {},
): VideoDelivery {
  const variants = playable
    ? [
        { url: `/${guid}/360.m3u8`, label: '360p', enabled: true, order: 0 },
        { url: `/${guid}/720.m3u8`, label: '720p', enabled: true, order: 1 },
        { url: `/${guid}/1080.m3u8`, label: '1080p', enabled: true, order: 2 },
      ]
    : [
        { url: `/${guid}/360.m3u8`, label: '360p', enabled: false },
        {
          url: `/${guid}/720.m3u8`,
          label: '720p',
          meta: { common: { access: { deniedReason: 'notSubscribed' } } },
        },
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
  };
}

/** Live delivery info for a broadcasting livestream: one origin, the adaptive playlist first. */
export function makeLiveDelivery(liveStreamId = LIVESTREAM_ID): VideoDelivery {
  return {
    groups: [
      {
        id: `${liveStreamId}-live`,
        label: 'live',
        origins: [{ id: 'origin-live', url: 'https://live.floatplane.test/' }],
        variants: [
          { url: `/${liveStreamId}/live-abr.m3u8?token=signed`, label: 'live-abr', enabled: true },
          { url: `/${liveStreamId}/1080.m3u8?token=signed`, label: '1080p', enabled: true },
        ],
      },
    ],
  };
}

/** A `useLiveStreams` entry for Tech Channel's livestream in the given state (for component tests). */
export function makeCreatorLiveStream(
  status: CreatorLiveStream['status'],
  overrides: Partial<CreatorLiveStream> = {},
): CreatorLiveStream {
  return {
    id: techCreator.id,
    creator: techCreator,
    liveStream: techLiveStream,
    status,
    streamUrl:
      status === 'live'
        ? `https://live.floatplane.test/${LIVESTREAM_ID}/live-abr.m3u8?token=signed`
        : null,
    error: status === 'error' ? new Error('Failed to check the live stream: 503 - down') : null,
    isFetching: false,
    checkedAt: status === 'loading' ? 0 : FIXED_NOW.getTime(),
    refetch: jest.fn(() => Promise.resolve(undefined)),
    ...overrides,
  };
}

/** `count` comments for a post, oldest first; the first has an avatar and replies. */
export function makeComments(postId: string, count: number): PostComment[] {
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1);
    return {
      id: `${postId}-comment-${n}`,
      blogPost: postId,
      user: {
        id: `commenter-${n}`,
        username: `commenter${n}`,
        profileImage:
          i === 0 ? { path: `https://cdn.floatplane.test/users/commenter-${n}.png` } : null,
      },
      text: `Comment number ${n} on ${postId}`,
      postDate: new Date(FIXED_NOW.getTime() - (i + 1) * 60_000).toISOString(),
      editDate: null,
      likes: i,
      dislikes: 0,
      totalReplies: i === 0 ? 2 : 0,
    };
  });
}
