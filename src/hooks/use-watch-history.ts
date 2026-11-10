import { useMemo } from 'react';

import { isNonEmpty } from '@/hooks/is-non-empty';
import { useGetWatchHistoryInfinite, type ContentHistoryEntry, type Video } from '@/shared';

interface FlattenedHistory {
  videos: Video[];
  progressById: Map<string, number>;
}

export type WatchHistory = ReturnType<typeof useGetWatchHistoryInfinite> & FlattenedHistory;

/**
 * The entry's post, when it still exists and has an id (typed as always present, but the API
 * omits posts that are gone).
 */
function postOf(entry: ContentHistoryEntry): Video | null {
  const post = entry.blogPost as Video | undefined;
  return post && isNonEmpty(post.id) ? post : null;
}

/** Posts in history order, each once (its first entry wins), skipping entries without a post. */
function flattenHistory(entries: ContentHistoryEntry[]): FlattenedHistory {
  const videos: Video[] = [];
  const progressById = new Map<string, number>();
  for (const entry of entries) {
    const post = postOf(entry);
    if (post && !progressById.has(post.id)) {
      videos.push(post);
      progressById.set(post.id, entry.progress);
    }
  }
  return { videos, progressById };
}

/**
 * The signed-in user's watch history (most recently watched first, as the API returns it),
 * flattened into the posts plus each post's saved progress in seconds.
 *
 * Offset pagination can return a post twice when the history shifts between pages (e.g. something
 * was watched meanwhile), so only its first (most recent) entry is kept. Entries whose post is
 * gone are skipped.
 */
export function useWatchHistory(
  token: string | undefined,
  tokenExpiration: string | undefined,
): WatchHistory {
  const query = useGetWatchHistoryInfinite(token, tokenExpiration);
  const pages = query.data?.pages;
  const { videos, progressById } = useMemo(() => flattenHistory(pages?.flat() ?? []), [pages]);
  return { ...query, videos, progressById };
}
