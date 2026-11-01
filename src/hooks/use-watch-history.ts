import { useMemo } from 'react';

import { useGetWatchHistoryInfinite, type Video } from '@/shared';

/**
 * The signed-in user's watch history (most recently watched first, as the API returns it),
 * flattened into the posts plus each post's saved progress in seconds.
 *
 * Offset pagination can return a post twice when the history shifts between pages (e.g. something
 * was watched meanwhile), so only its first (most recent) entry is kept. Entries whose post is
 * gone are skipped.
 */
export function useWatchHistory(token: string | undefined, tokenExpiration: string | undefined) {
  const query = useGetWatchHistoryInfinite(token, tokenExpiration);

  const { videos, progressById } = useMemo(() => {
    const posts: Video[] = [];
    const progress = new Map<string, number>();
    for (const entry of query.data?.pages.flat() ?? []) {
      const post = entry.blogPost;
      if (!post?.id || progress.has(post.id)) continue;
      posts.push(post);
      progress.set(post.id, entry.progress);
    }
    return { videos: posts, progressById: progress };
  }, [query.data?.pages]);

  return { ...query, videos, progressById };
}
