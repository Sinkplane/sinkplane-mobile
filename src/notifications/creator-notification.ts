import type { Video } from '@/shared';

/**
 * `creatorNotification` sync event payload (as floatplane.com's notification store reads it).
 * Every field is optional: this comes off the wire, so it is validated before use.
 */
export interface CreatorNotificationPayload {
  id?: string;
  /** e.g. `CONTENT_POST_RELEASE`. */
  eventType?: string;
  title?: string;
  message?: string;
  creator?: string;
  channel?: string;
  /** The blog post id for post releases. */
  content?: string;
  icon?: string;
  target?: { url?: string; match?: string; matchScheme?: string; matchPortion?: string; foregroundDiscardOnMatch?: boolean };
  post?: { id?: string; title?: string };
}

/** A notification ready to show: where it came from and where tapping it leads. */
export interface AppNotification {
  /**
   * Stable id — `post:<postId>` for posts, whichever path (live socket or background check) found
   * it — used to de-duplicate and as the OS notification identifier.
   */
  id: string;
  title: string;
  body: string;
  creatorId: string | null;
  /** Post to open on tap (null: the notification just opens the app). */
  postId: string | null;
}

export const POST_RELEASE_EVENT = 'CONTENT_POST_RELEASE';

export const postKey = (postId: string) => `post:${postId}`;

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** `…/post/<id>` in a target URL (absolute or path-only). */
function postIdFromUrl(url: unknown): string | null {
  const match = typeof url === 'string' ? /\/post\/([A-Za-z0-9_-]+)/.exec(url) : null;
  return match ? match[1] : null;
}

/** The released post's id (post releases only). */
function postIdOf(payload: CreatorNotificationPayload): string | null {
  if (payload.eventType !== POST_RELEASE_EVENT) return null;
  return str(payload.content) ?? str(payload.post?.id) ?? postIdFromUrl(payload.target?.url);
}

/** Validate a `creatorNotification` payload; null when there is nothing to show. */
export function parseCreatorNotification(data: unknown): AppNotification | null {
  if (!data || typeof data !== 'object') return null;
  const payload = data as CreatorNotificationPayload;

  const postId = postIdOf(payload);
  const title = str(payload.title);
  const body = str(payload.message) ?? str(payload.post?.title) ?? '';
  if (!title && !body) return null;

  const id = postId ? postKey(postId) : str(payload.id);
  if (!id) return null;

  return { id, title: title ?? 'Floatplane', body, creatorId: str(payload.creator), postId };
}

/** The notification for a post found by the background check (same shape as a live one). */
export function notificationForPost(
  video: Pick<Video, 'id' | 'title'>,
  creatorTitle: string | undefined,
  creatorId: string,
): AppNotification {
  return {
    id: postKey(video.id),
    title: creatorTitle ? `New post from ${creatorTitle}` : 'New post',
    body: video.title,
    creatorId,
    postId: video.id,
  };
}
