import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

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
  channel?: string;
  /** Page size per creator request. */
  limit?: number;
  /** Title search passed to the API. */
  search?: string;
  sort: AssDass;
}

const DEFAULT_LIMIT = 20;

/** Videos of one creator as returned by /api/v3/content/creator. */
async function fetchCreatorVideos(token: string, params: Required<Pick<SubscriptionFeedParams, 'sort'>> & {
  id: string;
  fetchAfter: number;
  limit: number;
  search: string;
  channel?: string;
}): Promise<Video[]> {
  const queryParams = new URLSearchParams({
    id: params.id,
    limit: params.limit.toString(),
    fetchAfter: params.fetchAfter.toString(),
    search: params.search,
    sort: params.sort,
    hasVideo: 'false',
    hasAudio: 'false',
    hasPicture: 'false',
    hasText: 'false',
  });
  if (params.channel) queryParams.append('channel', params.channel);

  const response = await authenticatedFetch(`/api/v3/content/creator?${queryParams.toString()}`, token);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch videos: ${response.status} - ${errorText}`);
  }
  return response.json();
}

/**
 * A feed "page" is one round of per-creator requests. `cursors` holds the offset the next round
 * should continue from per creator; creators missing from it are exhausted (their last page came
 * back short) and are not requested again.
 */
interface FeedPage {
  videos: Video[];
  cursors: Record<string, number>;
}

function compareByRelease(a: Video, b: Video, sort: AssDass): number {
  const aDate = a.releaseDate ?? '';
  const bDate = b.releaseDate ?? '';
  if (aDate === bDate) return 0;
  const oldestFirst = aDate < bDate ? -1 : 1;
  return sort === AssDass.ASC ? oldestFirst : -oldestFirst;
}

/**
 * Infinite feed of posts across the given creators (all subscriptions, or one selected creator),
 * globally ordered by release date.
 */
export function useSubscriptionFeed(token: string | undefined, params: SubscriptionFeedParams) {
  const { creatorIds, channel, search, sort, limit = DEFAULT_LIMIT } = params;

  const query = useInfiniteQuery({
    queryKey: ['subscription-feed', token, creatorIds, sort, search ?? '', channel ?? ''],
    enabled: !!token && creatorIds.length > 0,
    initialPageParam: {} as Record<string, number>,
    queryFn: async ({ pageParam }) => {
      // First round starts every creator at 0; later rounds continue from the cursors.
      const offsets = Object.keys(pageParam).length > 0 ? pageParam : Object.fromEntries(creatorIds.map(id => [id, 0]));

      const perCreator = await Promise.all(
        Object.entries(offsets).map(async ([id, fetchAfter]) => ({
          id,
          fetchAfter,
          videos: await fetchCreatorVideos(token!, { id, fetchAfter, limit, search: search ?? '', sort, channel }),
        })),
      );

      const merged = perCreator.flatMap(round => round.videos).sort((a, b) => compareByRelease(a, b, sort));
      const cursors: Record<string, number> = {};
      for (const { id, fetchAfter, videos: pageVideos } of perCreator) {
        // A short page means this creator has nothing left; only full pages continue.
        if (pageVideos.length === limit) cursors[id] = fetchAfter + pageVideos.length;
      }
      return { videos: merged, cursors } satisfies FeedPage;
    },
    getNextPageParam: lastPage => (Object.keys(lastPage.cursors).length > 0 ? lastPage.cursors : undefined),
  });

  // Pages are merged per round, but rounds can interleave (a creator's next page may be newer than
  // another creator's earlier tail), so the displayed list re-sorts everything fetched so far.
  const videos = useMemo(() => {
    const all = query.data?.pages.flatMap(page => page.videos) ?? [];
    const seen = new Set<string>();
    return all
      .filter(video => {
        if (seen.has(video.id)) return false;
        seen.add(video.id);
        return true;
      })
      .sort((a, b) => compareByRelease(a, b, sort));
  }, [query.data?.pages, sort]);

  return { ...query, videos };
}
