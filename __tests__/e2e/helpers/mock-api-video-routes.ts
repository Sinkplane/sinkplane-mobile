/**
 * Mock Floatplane video page endpoints: post, delivery info (on-demand + live), comments,
 * like/dislike toggles, progress saving, related posts (the end screen's suggestions).
 */

import { makeComments, makeLiveDelivery, makeVideoDelivery, makeVideoPost } from '@test/fixtures';
import type { Video, VideoPost } from '@/shared';

import type { RouteHandler } from './mock-api-auth-routes';
import {
  apiError,
  type FloatplaneApiStore,
  type MockResponse,
  type RecordedRequest,
} from './mock-api-store';

const ok = (body: unknown): MockResponse => ({ status: 200, body });

/** A post derived from a feed video plus the user's reaction and saved progress. */
function derivedPost(store: FloatplaneApiStore, video: Video): VideoPost {
  const interaction = store.interactions.get(video.id) ?? null;
  return makeVideoPost(video, {
    likes: video.likes + (interaction === 'like' ? 1 : 0),
    dislikes: video.dislikes + (interaction === 'dislike' ? 1 : 0),
    userInteraction: interaction === null ? [] : [interaction],
    progress: store.progress.get(video.id) ?? null,
  });
}

/** The post an id maps to: an explicit override, or one derived from the feed fixtures. */
function postFor(store: FloatplaneApiStore, id: string): VideoPost | null {
  const override = store.posts.get(id);
  if (override) {
    return override;
  }
  const video = store.findVideo(id);
  return video ? derivedPost(store, video) : null;
}

const post: RouteHandler = (store, req) => {
  const found = postFor(store, req.params.get('id') ?? '');
  return found ? ok(found) : apiError(404, 'notFoundError', 'No post with that id.');
};

/** Live delivery info: 404 while offline, unless the store hands it out anyway (like the real API). */
function liveDeliveryInfo(store: FloatplaneApiStore, liveStreamId: string): MockResponse {
  if (!store.liveNow.has(liveStreamId) && !store.liveDeliveryWhenOffline) {
    return apiError(404, 'notFoundError', 'The livestream is not live.');
  }
  return ok(store.liveDeliveries.get(liveStreamId) ?? makeLiveDelivery(liveStreamId));
}

/** Playback info for a video attachment guid, or (`entityKind=livestream`) a livestream id. */
const deliveryInfo: RouteHandler = (store, { params }) => {
  const entityId = params.get('entityId') ?? '';
  if (params.get('entityKind') === 'livestream') {
    return liveDeliveryInfo(store, entityId);
  }
  return ok(store.deliveries.get(entityId) ?? makeVideoDelivery(entityId));
};

/** One page of a post's comments, continuing after `fetchAfter` (the last id already loaded). */
const postComments: RouteHandler = (store, { params }) => {
  const postId = params.get('blogPost') ?? '';
  const list = store.comments.get(postId) ?? makeComments(postId, 3);
  const start = params.has('fetchAfter')
    ? list.findIndex((c) => c.id === params.get('fetchAfter')) + 1
    : 0;
  const limit = Number(params.get('limit') ?? 20);
  return ok(list.slice(Math.max(start, 0), Math.max(start, 0) + limit));
};

/** Floatplane toggle semantics: reposting the active reaction removes it; cross-toggling switches. */
function toggleReaction(
  store: FloatplaneApiStore,
  req: RecordedRequest,
  kind: 'like' | 'dislike',
): MockResponse {
  const id = req.body?.['id'];
  if (typeof id !== 'string' || id === '') {
    return apiError(400, 'invalidBodyError', 'Missing post id.');
  }
  const next = store.interactions.get(id) === kind ? null : kind;
  store.interactions.set(id, next);
  return ok(next === null ? [] : [next]);
}

/** Save watch progress — and move the post to the front of the history, like the real backend. */
const saveProgress: RouteHandler = (store, req) => {
  const { id, progress } = req.body ?? {};
  const postId = String(id);
  const watched = Math.floor(Number(progress));
  store.progress.set(postId, watched);
  const video = store.findVideo(postId);
  if (video) {
    store.seedHistoryEntry(video, watched, new Date().toISOString());
  }
  return ok('OK');
};

/** Related posts: an override, else up to 5 other videos from the post's channel. */
const relatedPosts: RouteHandler = (store, { params }) => {
  const id = params.get('id') ?? '';
  const override = store.related.get(id);
  if (override) {
    return ok(override);
  }
  const video = store.findVideo(id);
  const channelId = video?.channel.id ?? '';
  return ok(
    store
      .channelVideos(channelId)
      .filter((other) => other.id !== id)
      .slice(0, 5),
  );
};

/** The video page's signed-in endpoints, by `METHOD /path`. */
export const VIDEO_PAGE_ROUTES = new Map<string, RouteHandler>([
  ['GET /api/v3/content/post', post],
  ['GET /api/v3/delivery/info', deliveryInfo],
  ['GET /api/v3/comment', postComments],
  ['POST /api/v3/content/like', (store, req) => toggleReaction(store, req, 'like')],
  ['POST /api/v3/content/dislike', (store, req) => toggleReaction(store, req, 'dislike')],
  ['POST /api/v3/content/progress', saveProgress],
  ['GET /api/v3/content/related', relatedPosts],
]);
