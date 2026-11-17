import { useMemo, useState } from 'react';

import { useIsOffline } from '@/hooks/use-offline';
import { usePostCache } from '@/hooks/use-post-cache';
import {
  usePostComments,
  type PostComment,
  type PostCommentsResult,
} from '@/hooks/use-post-comments';
import { usePostReaction } from '@/hooks/use-post-reaction';
import { useResumePosition, type ResumePosition } from '@/hooks/use-resume-position';
import { useSuggestedVideos } from '@/hooks/use-suggested-videos';
import { useDownloadedVideo } from '@/hooks/use-video-download';
import { useGetVideoDelivery, useGetVideoPost, useSession, type VideoPost } from '@/shared';
import type { DownloadedVideo } from '@/utils/download-library';
import { getStreamUrl } from '@/utils/stream-source';

type VideoAttachment = VideoPost['videoAttachments'][number];

/** The post's fields as the API may send them (the attachments can be missing). */
interface LoosePost {
  readonly videoAttachments?: readonly VideoAttachment[] | null;
}

function firstAttachment(post: LoosePost | undefined): VideoAttachment | undefined {
  return post?.videoAttachments?.[0];
}

/** The attachment whose stream to fetch: none for a downloaded video (it plays from the device). */
function attachmentToStream(
  attachment: VideoAttachment | undefined,
  download: DownloadedVideo | undefined,
): string | undefined {
  return download === undefined ? attachment?.guid : undefined;
}

/** The session's token and expiration, as the shared hooks take them (no nulls). */
function useApiSession() {
  const { token, tokenExpiration } = useSession();
  return { token, apiToken: token ?? undefined, expiration: tokenExpiration ?? undefined };
}

/** The comments loaded so far, flattened (undefined until the first page arrives). */
function useLoadedComments(token: string | null | undefined, id: string) {
  const comments = usePostComments(token, id);
  const loaded = useMemo(() => comments.data?.pages.flat(), [comments.data]);
  return { comments, loaded };
}

/**
 * Where to start, kept from the first time it's known: the player reads it only when it mounts,
 * and a later lookup (e.g. back online after an offline start) turning "not ready" again would
 * unmount the playing video.
 */
function useStartPosition(
  token: string | null | undefined,
  id: string,
  post: { offline: boolean; data: VideoPost | undefined },
): ResumePosition {
  const resume = useResumePosition(post.offline ? undefined : token, id, post.data);
  const [kept, setKept] = useState<ResumePosition>();
  if (kept === undefined && resume.ready) {
    setKept(resume);
  }
  return kept ?? resume;
}

/**
 * The saved copy stands in only when Floatplane can't answer (offline, or the request failed), so
 * an online page never starts from stale details or progress.
 */
function fallbackTo<T>(saved: T | undefined, offline: boolean, failed: boolean): T | undefined {
  return offline || failed ? saved : undefined;
}

type PostQuery = ReturnType<typeof useGetVideoPost>;
type DeliveryQuery = ReturnType<typeof useGetVideoDelivery>;

export interface VideoPageData {
  readonly token: string | null | undefined;
  /** No network (or offline mode): reactions are off and nothing that needs Floatplane is tried. */
  readonly offline: boolean;
  readonly post: PostQuery;
  /** The loaded post, else its saved copy. */
  readonly postData: VideoPost | undefined;
  readonly attachment: VideoAttachment | undefined;
  /** The post's download: played instead of the stream. */
  readonly download: DownloadedVideo | undefined;
  readonly delivery: DeliveryQuery;
  readonly streamUrl: string | null | undefined;
  readonly comments: PostCommentsResult;
  readonly loadedComments: readonly PostComment[] | undefined;
  /** The comments saved last time (offline, when none could load). */
  readonly savedComments: readonly PostComment[] | undefined;
  readonly reaction: ReturnType<typeof usePostReaction>;
  readonly resume: ResumePosition;
  readonly suggested: ReturnType<typeof useSuggestedVideos>;
}

/**
 * Everything the video page shows. The post comes from Floatplane, else from the copy saved the
 * last time it was opened (offline). A downloaded video plays from the device, so its stream is
 * never fetched. Offline, the saved comments stand in and the resume position isn't looked up.
 */
export function useVideoPageData(id: string): VideoPageData {
  const { token, apiToken, expiration } = useApiSession();
  const offline = useIsOffline();
  const post = useGetVideoPost(apiToken, expiration, id);
  const download = useDownloadedVideo(id);
  const { comments, loaded } = useLoadedComments(token, id);
  const saved = usePostCache(id, post.data, loaded);
  const postData = post.data ?? fallbackTo(saved?.post, offline, post.isError);
  const attachment = firstAttachment(postData);
  const stream = attachmentToStream(attachment, download);
  const delivery = useGetVideoDelivery(apiToken, expiration, stream);
  return {
    token,
    offline,
    post,
    postData,
    attachment,
    download,
    delivery,
    streamUrl: getStreamUrl(delivery.data),
    comments,
    loadedComments: loaded,
    savedComments: fallbackTo(saved?.comments, offline, comments.isError),
    reaction: usePostReaction(token, postData),
    resume: useStartPosition(token, id, { offline, data: postData }),
    suggested: useSuggestedVideos(token, expiration, id),
  };
}

/** The comments to list: the loaded ones, else (offline) the saved ones. */
export function commentsToShow(data: VideoPageData): readonly PostComment[] {
  return data.loadedComments ?? data.savedComments ?? [];
}
