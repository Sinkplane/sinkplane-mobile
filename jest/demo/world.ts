/**
 * The demo world: loads ./catalog.ts into the E2E suite's in-memory Floatplane API. Used by demo
 * mode (store/demo, `SINKPLANE_DEMO=1 pnpm start`) to take store screenshots without anyone's real content, and by
 * __tests__/e2e/demo-mode.e2e.test.tsx, which keeps it working.
 */

import { makeChannel, makeCreator, makeSubscription, makeVideo } from '@test/fixtures';
import type { PostComment } from '@/hooks/use-post-comments';
import type { Channel, Creator, Subscription, User, Video, VideoDelivery } from '@/shared';

import type { FloatplaneApiStore } from '../../__tests__/e2e/helpers/mock-api-store';
import {
  DEMO_COMMENTS,
  DEMO_CREATORS,
  DEMO_HISTORY,
  DEMO_USER,
  type DemoChannelSpec,
  type DemoCreatorSpec,
  type DemoVideoSpec,
} from './catalog';

export interface DemoWorldOptions {
  /** Where store/demo/media is served (images and HLS streams). */
  mediaBaseUrl: string;
  /** Release and watch dates are relative to this. */
  now: Date;
}

const HOUR_MS = 60 * 60 * 1000;
const THUMB = { width: 1280, height: 720 };
const ICON = { width: 512, height: 512 };
/** Comments on posts other than the first one. */
const OTHER_POST_COMMENTS = 3;
/** The newest video, which gets every demo comment. */
const FEATURED_VIDEO = DEMO_CREATORS[0]?.channels[0].videos[0]?.slug;

/** How many of the demo comments a post shows. */
const shownComments = (slug: string): number =>
  slug === FEATURED_VIDEO ? DEMO_COMMENTS.length : OTHER_POST_COMMENTS;

/** A post's comment count: its comments plus their replies. */
const commentCount = (slug: string): number =>
  DEMO_COMMENTS.slice(0, shownComments(slug)).reduce(
    (total, [, , , replies]) => total + 1 + replies,
    0,
  );

interface DemoContext extends DemoWorldOptions {
  media: (path: string) => { width: number; height: number; path: string; childImages: never[] };
}

function context(options: DemoWorldOptions): DemoContext {
  const base = options.mediaBaseUrl.endsWith('/')
    ? options.mediaBaseUrl.slice(0, -1)
    : options.mediaBaseUrl;
  return {
    ...options,
    media: (path) => ({
      ...(path.startsWith('icons/') ? ICON : THUMB),
      path: `${base}/${path}`,
      childImages: [],
    }),
  };
}

const hoursBefore = (now: Date, hours: number): string =>
  new Date(now.getTime() - hours * HOUR_MS).toISOString();

const seconds = (length: string): number => {
  const [minutes = 0, secs = 0] = length.split(':').map(Number);
  return minutes * 60 + secs;
};

const demoUser = (ctx: Pick<DemoContext, 'media'>): User => ({
  id: DEMO_USER.id,
  username: DEMO_USER.username,
  displayName: DEMO_USER.displayName,
  profileImage: ctx.media(`icons/${DEMO_USER.username}.png`),
});

function demoLiveStream(ctx: DemoContext, spec: DemoCreatorSpec): Creator['liveStream'] {
  if (!spec.live) {
    return undefined;
  }
  return {
    id: `live-${spec.slug}`,
    title: spec.live.title,
    description: `<p>${spec.live.description}</p>`,
    thumbnail: ctx.media(`live/${spec.slug}.jpg`),
    owner: `owner-${spec.slug}`,
    channel: spec.channels[0].slug,
    streamPath: `/live/${spec.slug}`,
    offline: {
      title: spec.live.offlineTitle,
      description: `<p>${spec.live.offlineTitle}</p>`,
      thumbnail: ctx.media(`live/${spec.slug}-offline.jpg`),
    },
  };
}

function demoCreator(ctx: DemoContext, spec: DemoCreatorSpec): Creator {
  const icon = ctx.media(`icons/${spec.slug}.png`);
  const channel = ({ slug, title }: DemoChannelSpec, order: number): Channel => ({
    ...makeChannel({ id: slug, creator: spec.slug }, title, order),
    icon,
  });
  const [first, ...rest] = spec.channels;
  const creator = makeCreator(
    { id: spec.slug, title: spec.title },
    [channel(first, 0), ...rest.map((c, i) => channel(c, i + 1))],
    demoLiveStream(ctx, spec),
  );
  return {
    ...creator,
    description: spec.about,
    about: spec.about,
    category: { id: `cat-${spec.category.toLowerCase()}`, title: spec.category },
    subscriberCountDisplay: spec.subscribers,
    icon,
    cover: ctx.media(`live/${spec.slug}-offline.jpg`),
    card: ctx.media(`live/${spec.slug}-offline.jpg`),
  };
}

function demoVideo(
  ctx: DemoContext,
  { creator, channel }: { creator: Creator; channel: Channel },
  spec: DemoVideoSpec,
): Video {
  const base = makeVideo(creator, channel, {
    id: spec.slug,
    title: spec.title,
    releaseDate: hoursBefore(ctx.now, spec.hoursAgo),
    duration: seconds(spec.length),
    likes: spec.likes,
  });
  return {
    ...base,
    text: `<p>${spec.description}</p>`,
    textMarkdown: spec.description,
    comments: commentCount(spec.slug),
    thumbnail: ctx.media(`thumbs/${spec.slug}.jpg`),
  };
}

function demoComments(ctx: DemoContext, postId: string, count: number): PostComment[] {
  return DEMO_COMMENTS.slice(0, count).map(([username, text, likes, replies], i) => ({
    id: `${postId}-comment-${String(i + 1)}`,
    blogPost: postId,
    user: {
      id: `user-${username}`,
      username,
      profileImage: { path: ctx.media(`icons/${username}.png`).path },
    },
    text,
    postDate: hoursBefore(ctx.now, i + 1),
    editDate: null,
    likes,
    dislikes: 0,
    totalReplies: replies,
    userInteraction: null,
  }));
}

/** Every on-demand video plays the same demo stream. */
const demoDelivery = (ctx: DemoContext, playlist: string): VideoDelivery => ({
  groups: [
    {
      id: 'demo-group',
      label: 'hls',
      origins: [{ id: 'demo-origin', url: ctx.media('').path }],
      variants: [{ url: playlist, label: '1080p', enabled: true, order: 0 }],
    },
  ],
});

function seedCreatorContent(store: FloatplaneApiStore, ctx: DemoContext, creator: Creator): void {
  const spec = DEMO_CREATORS.find((c) => c.slug === creator.id);
  creator.channels.forEach((channel, index) => {
    const videos = spec?.channels[index]?.videos ?? [];
    store.setChannelVideos(
      creator.id,
      channel.id,
      videos.map((v) => demoVideo(ctx, { creator, channel }, v)),
    );
  });
  const live = creator.liveStream;
  if (live && spec?.live?.live === true) {
    store.liveNow.add(live.id);
    store.liveDeliveries.set(live.id, demoDelivery(ctx, '/hls/live/index.m3u8'));
  }
}

function seedPostDetails(store: FloatplaneApiStore, ctx: DemoContext): void {
  const delivery = demoDelivery(ctx, '/hls/video/index.m3u8');
  [...store.videos.values()]
    .flatMap((byChannel) => [...byChannel.values()].flat())
    .forEach((video) => {
      store.comments.set(video.id, demoComments(ctx, video.id, shownComments(video.id)));
      store.deliveries.set(`${video.id}-guid`, delivery);
      store.deliveries.set(`${video.id}-attachment`, delivery);
    });
}

function seedHistory(store: FloatplaneApiStore, ctx: DemoContext): void {
  DEMO_HISTORY.forEach(([slug, watched, hoursAgo]) => {
    const video = store.findVideo(slug);
    if (!video) {
      return;
    }
    const progress = Math.round(video.metadata.videoDuration * watched);
    store.progress.set(video.id, progress);
    store.seedHistoryEntry(video, progress, hoursBefore(ctx.now, hoursAgo));
  });
}

/** The demo creators, as subscriptions in catalog order. */
function demoSubscriptions(creators: Creator[]): Subscription[] {
  return creators.map((creator) => {
    const spec = DEMO_CREATORS.find((c) => c.slug === creator.id);
    return makeSubscription(creator, spec?.plan ?? creator.title);
  });
}

/**
 * Replace the store's world with the demo one: user and sign-in account (no captcha), creators,
 * feed, comments, playable streams, a live stream and watch history.
 */
export function seedDemoWorld(store: FloatplaneApiStore, options: DemoWorldOptions): void {
  const ctx = context(options);
  const creators = DEMO_CREATORS.map((spec) => demoCreator(ctx, spec));
  store.replaceWorld({
    user: demoUser(ctx),
    login: { username: DEMO_USER.username, email: DEMO_USER.email, password: DEMO_USER.password },
    captcha: false,
    creators,
    subscriptions: demoSubscriptions(creators),
  });
  creators.forEach((creator) => {
    seedCreatorContent(store, ctx, creator);
  });
  seedPostDetails(store, ctx);
  seedHistory(store, ctx);
}
