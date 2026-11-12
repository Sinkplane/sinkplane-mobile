import { useMemo } from 'react';

import { useGetRelatedVideos, type Video } from '@/shared';

const NONE: Video[] = [];

/**
 * What the video page's end screen suggests: Floatplane's related posts for `id` (TV app parity),
 * minus the video itself. Empty while loading or on failure, so the end screen just doesn't show.
 */
export function useSuggestedVideos(
  token: string | null | undefined,
  tokenExpiration: string | null | undefined,
  id: string,
): Video[] {
  const related = useGetRelatedVideos(token ?? undefined, tokenExpiration ?? undefined, id);
  return useMemo(
    () => (related.data ?? NONE).filter((video) => video.id !== id),
    [related.data, id],
  );
}
