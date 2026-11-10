import { useMemo } from 'react';
import {
  skipToken,
  useInfiniteQuery,
  type InfiniteData,
  type QueryKey,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';

import { isNonEmpty } from '@/hooks/is-non-empty';
import { authenticatedFetch, AssDass, type Video } from '@/shared';

/**
 * One page of videos per creator. Floatplane's content API lists a single creator per request,
 * so the "all subscriptions" home feed (like floatplane.com's) is assembled client-side: one
 * request per creator per round, merged by release date.
 */
export interface SubscriptionFeedParams {
  /** Creators whose posts make up the feed (one entry narrows it to that creator). */
  creatorIds: string[];
  /** Restrict to one channel of the (single) selected creator. */
  channel?: string | undefined;
  /** Page size per creator request. */
  limit?: number | undefined;
  /** Title search passed to the API. */
  search?: string | undefined;
  sort: AssDass;
}

const DEFAULT_LIMIT = 20;

/** Per creator, the offset the next round continues from. */
type Cursors = Record<string, number>;

/** The first round: no cursors yet, every creator starts at 0. */
const FIRST_ROUND: Cursors = {};

/**
 * A feed "page" is one round of per-creator requests. `cursors` holds the offset the next round
 * should continue from per creator; creators missing from it are exhausted (their last page came
 * back short) and are not requested again.
 */
interface FeedPage {
  videos: Video[];
  cursors: Cursors;
}

export type SubscriptionFeed = UseInfiniteQueryResult<InfiniteData<FeedPage, Cursors>> & {
  videos: Video[];
};

/** The request settings shared by every creator of a round. */
interface RoundParams {
  token: string;
  limit: number;
  search: string;
  sort: AssDass;
  channel: string | undefined;
}

interface CreatorRound {
  id: string;
  fetchAfter: number;
  videos: Video[];
}

/** Videos of one creator as returned by /api/v3/content/creator. */
async function fetchCreatorVideos(
  { token, limit, search, sort, channel }: RoundParams,
  { id, fetchAfter }: { id: string; fetchAfter: number },
): Promise<Video[]> {
  const queryParams = new URLSearchParams({
    id,
    limit: limit.toString(),
    fetchAfter: fetchAfter.toString(),
    search,
    sort,
    hasVideo: 'false',
    hasAudio: 'false',
    hasPicture: 'false',
    hasText: 'false',
  });
  if (isNonEmpty(channel)) {
    queryParams.append('channel', channel);
  }

  const response = await authenticatedFetch(
    `/api/v3/content/creator?${queryParams.toString()}`,
    token,
  );
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch videos: ${String(response.status)} - ${errorText}`);
  }
  return (await response.json()) as Video[];
}

function compareByRelease(a: Video, b: Video, sort: AssDass): number {
  const aDate = a.releaseDate ?? '';
  const bDate = b.releaseDate ?? '';
  if (aDate === bDate) {
    return 0;
  }
  const oldestFirst = aDate < bDate ? -1 : 1;
  return sort === AssDass.ASC ? oldestFirst : -oldestFirst;
}

/** Merges one round by release date; only creators whose page came back full continue. */
function mergeRound(rounds: CreatorRound[], { limit, sort }: RoundParams): FeedPage {
  const videos = rounds
    .flatMap((round) => round.videos)
    .sort((a, b) => compareByRelease(a, b, sort));
  const cursors: Cursors = {};
  for (const { id, fetchAfter, videos: pageVideos } of rounds) {
    // A short page means this creator has nothing left; only full pages continue.
    if (pageVideos.length === limit) {
      cursors[id] = fetchAfter + pageVideos.length;
    }
  }
  return { videos, cursors };
}

/** One round of per-creator requests, continuing from `cursors` (or from 0 on the first round). */
async function fetchFeedRound(
  params: RoundParams,
  creatorIds: string[],
  cursors: Cursors,
): Promise<FeedPage> {
  const offsets =
    Object.keys(cursors).length > 0 ? cursors : Object.fromEntries(creatorIds.map((id) => [id, 0]));
  const rounds = await Promise.all(
    Object.entries(offsets).map(async ([id, fetchAfter]): Promise<CreatorRound> => ({
      id,
      fetchAfter,
      videos: await fetchCreatorVideos(params, { id, fetchAfter }),
    })),
  );
  return mergeRound(rounds, params);
}

const nextCursors = (lastPage: FeedPage): Cursors | undefined =>
  Object.keys(lastPage.cursors).length > 0 ? lastPage.cursors : undefined;

/** Every video fetched so far, each once, in release order. */
function feedVideos(pages: FeedPage[], sort: AssDass): Video[] {
  const seen = new Set<string>();
  return pages
    .flatMap((page) => page.videos)
    .filter((video) => {
      if (seen.has(video.id)) {
        return false;
      }
      seen.add(video.id);
      return true;
    })
    .sort((a, b) => compareByRelease(a, b, sort));
}

const feedKey = (token: string | undefined, params: SubscriptionFeedParams) =>
  [
    'subscription-feed',
    token,
    params.creatorIds,
    params.sort,
    params.search ?? '',
    params.channel ?? '',
  ] as const;

/** The round settings, or null while the feed can't load (no session or no creators). */
function roundParams(
  token: string | undefined,
  params: SubscriptionFeedParams,
): RoundParams | null {
  if (!isNonEmpty(token) || params.creatorIds.length === 0) {
    return null;
  }
  const { channel, search = '', sort, limit = DEFAULT_LIMIT } = params;
  return { token, limit, search, sort, channel };
}

/**
 * Infinite feed of posts across the given creators (all subscriptions, or one selected creator),
 * globally ordered by release date.
 */
export function useSubscriptionFeed(
  token: string | undefined,
  params: SubscriptionFeedParams,
): SubscriptionFeed {
  const { creatorIds, sort } = params;
  const round = roundParams(token, params);

  const query = useInfiniteQuery<
    FeedPage,
    Error,
    InfiniteData<FeedPage, Cursors>,
    QueryKey,
    Cursors
  >({
    queryKey: feedKey(token, params),
    queryFn: round ? ({ pageParam }) => fetchFeedRound(round, creatorIds, pageParam) : skipToken,
    initialPageParam: FIRST_ROUND,
    getNextPageParam: nextCursors,
  });

  // Pages are merged per round, but rounds can interleave (a creator's next page may be newer than
  // another creator's earlier tail), so the displayed list re-sorts everything fetched so far.
  const pages = query.data?.pages;
  const videos = useMemo(() => feedVideos(pages ?? [], sort), [pages, sort]);

  return { ...query, videos };
}
