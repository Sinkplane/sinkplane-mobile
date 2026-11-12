import { useMemo } from 'react';

import { useGetVideoProgress, type VideoPost } from '@/shared';

export interface ResumePosition {
  /** False while the fallback lookup is still answering: don't mount the player yet. */
  ready: boolean;
  /** Where to start, in seconds; undefined to start from the beginning. */
  seconds: number | undefined;
}

type BatchQuery = ReturnType<typeof useGetVideoProgress>;

/** A saved position worth resuming from (Floatplane reports 0 / null for unwatched videos). */
function positive(seconds: number | null | undefined): number | undefined {
  return seconds !== null && seconds !== undefined && seconds > 0 ? seconds : undefined;
}

/**
 * The batch endpoint's answer for `id`. `keepPreviousData` can show another video's progress while
 * this one loads, so a placeholder still fetching counts as not ready.
 */
function fromBatch(batch: BatchQuery, id: string | undefined): ResumePosition {
  const waiting = batch.fetchStatus === 'fetching' && (batch.isPending || batch.isPlaceholderData);
  if (waiting) {
    return { ready: false, seconds: undefined };
  }
  return { ready: true, seconds: positive(batch.data?.find((entry) => entry.id === id)?.progress) };
}

/**
 * Where a video should resume. Floatplane's post endpoint often leaves out `progress`, so (like the
 * TV app) fall back to the batch progress endpoint (`/api/v3/content/progress`). The player reads
 * its start position once, when it mounts, so `ready` stays false until the fallback has answered
 * (or failed): mounting earlier would start the video from the beginning.
 */
export function useResumePosition(
  token: string | null | undefined,
  id: string | undefined,
  post: VideoPost | undefined,
): ResumePosition {
  const fromPost = positive(post?.progress);
  const ids = useMemo(
    () => (id === undefined || fromPost !== undefined ? [] : [id]),
    [id, fromPost],
  );
  const batch = useGetVideoProgress(token ?? undefined, ids);
  return fromPost === undefined ? fromBatch(batch, id) : { ready: true, seconds: fromPost };
}
