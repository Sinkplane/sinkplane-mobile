/**
 * Mock Floatplane endpoints that require a valid session: profile, subscriptions, creators, content
 * listing, watch progress / history, notification settings.
 */

import { fixtureUser, makeHistoryEntry } from '@test/fixtures';
import type { Video } from '@/shared';

import type { RouteHandler } from './mock-api-auth-routes';
import { apiError, type FloatplaneApiStore, type MockResponse } from './mock-api-store';

const ok = (body: unknown): MockResponse => ({ status: 200, body });

/** The `ids[0]=…&ids[1]=…` query parameters, in index order. */
export function indexedParams(params: URLSearchParams): string[] {
  const ids: string[] = [];
  params.forEach((value, key) => {
    const match = /^ids\[(\d+)\]$/.exec(key);
    if (match) {
      ids[Number(match[1])] = value;
    }
  });
  return ids;
}

const byReleaseDateDesc = (a: Video, b: Video): number =>
  (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '');

/** One channel's videos, or every channel's merged newest first. */
function channelOrAll(byChannel: Map<string, Video[]>, channel: string | null): Video[] {
  if (channel !== null && channel !== '') {
    return byChannel.get(channel) ?? [];
  }
  return [...byChannel.values()].flat().sort(byReleaseDateDesc);
}

function matchesSearch(video: Video, search: string): boolean {
  return (
    video.title.toLowerCase().includes(search) || video.textMarkdown.toLowerCase().includes(search)
  );
}

/** `sort` (ASC reverses the newest-first list), then the `fetchAfter` / `limit` page. */
function sortedPage(videos: Video[], params: URLSearchParams): Video[] {
  const ordered = params.get('sort') === 'ASC' ? [...videos].reverse() : videos;
  const fetchAfter = Number(params.get('fetchAfter') ?? 0);
  const limit = Number(params.get('limit') ?? 10);
  return ordered.slice(fetchAfter, fetchAfter + limit);
}

function contentCreator(
  store: FloatplaneApiStore,
  { params }: { params: URLSearchParams },
): MockResponse {
  const byChannel = store.videos.get(params.get('id') ?? '');
  if (!byChannel) {
    return ok([]);
  }
  const search = (params.get('search') ?? '').trim().toLowerCase();
  const matched = channelOrAll(byChannel, params.get('channel'));
  const filtered =
    search === '' ? matched : matched.filter((video) => matchesSearch(video, search));
  return ok(sortedPage(filtered, params));
}

function notificationList(store: FloatplaneApiStore): MockResponse {
  return ok(
    store.subscriptions.flatMap((sub) => {
      const creator = store.creators.find((c) => c.id === sub.creator);
      if (!creator) {
        return [];
      }
      return [
        {
          creator,
          userNotificationSetting: {
            creator: creator.id,
            user: fixtureUser.id,
            ...store.notificationSettingFor(creator.id),
            creatorMessageEmail: true,
          },
        },
      ];
    }),
  );
}

function updateNotificationSetting(
  store: FloatplaneApiStore,
  { body }: { body: Record<string, unknown> | null },
): MockResponse {
  const { creator, property, newValue } = body ?? {};
  if (
    typeof creator !== 'string' ||
    (property !== 'contentFirebase' && property !== 'contentEmail') ||
    typeof newValue !== 'boolean'
  ) {
    return apiError(400, 'invalidBodyError', 'Invalid notification setting.');
  }
  store.notificationSettings.set(creator, {
    ...store.notificationSettingFor(creator),
    [property]: newValue,
  });
  return ok({ [property]: newValue });
}

/** One page of the watch history, newest watch first, continuing after `offset`. */
function contentHistory(
  store: FloatplaneApiStore,
  { params }: { params: URLSearchParams },
): MockResponse {
  const offset = Number(params.get('offset') ?? 0);
  const ordered = [...store.history].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const page = ordered
    .slice(offset, offset + store.historyPageSize)
    .map((entry) => makeHistoryEntry(entry.video, entry.progress, entry.updatedAt));
  return ok(page);
}

const status: RouteHandler = () =>
  ok({ selfUser: fixtureUser, selfCreator: null, serviceMessages: [], serviceDenied: null });

const creatorList: RouteHandler = (store, req) =>
  ok(
    indexedParams(req.params)
      .map((id) => store.creators.find((c) => c.id === id))
      .filter((creator) => creator !== undefined),
  );

const watchProgress: RouteHandler = (store, req) =>
  ok(
    indexedParams(req.params)
      .filter((id) => store.progress.has(id))
      .map((id) => ({ id, progress: store.progress.get(id) })),
  );

/** Signed-in endpoints outside the video page, by `METHOD /path`. */
export const CONTENT_ROUTES = new Map<string, RouteHandler>([
  ['GET /api/v3/status', status],
  ['GET /api/v3/user/subscriptions', (store) => ok(store.subscriptions)],
  ['GET /api/v3/creator/list', creatorList],
  ['GET /api/v3/content/creator', contentCreator],
  ['GET /api/v3/content/history', contentHistory],
  ['GET /api/v3/user/notification/list', notificationList],
  ['POST /api/v3/user/notification/update', updateNotificationSetting],
  ['GET /api/v3/content/progress', watchProgress],
]);
