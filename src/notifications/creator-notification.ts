import type { Video } from '@/shared';

import { isJsonObject, objectField, type JsonObject } from './json-fields';

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
  target?: {
    url?: string;
    match?: string;
    matchScheme?: string;
    matchPortion?: string;
    foregroundDiscardOnMatch?: boolean;
  };
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

const postKey = (postId: string): string => `post:${postId}`;

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/** `…/post/<id>` in a target URL (absolute or path-only). */
function postIdFromUrl(url: unknown): string | null {
  const match = typeof url === 'string' ? /\/post\/([A-Za-z0-9_-]+)/.exec(url) : null;
  return match?.[1] ?? null;
}

/** The released post's id (post releases only). */
function postIdOf(payload: JsonObject): string | null {
  if (payload['eventType'] !== POST_RELEASE_EVENT) {
    return null;
  }
  return (
    str(payload['content']) ??
    str(objectField(payload, 'post')['id']) ??
    postIdFromUrl(objectField(payload, 'target')['url'])
  );
}

/** Title (null: none sent) and body (empty: none sent). */
function textOf(payload: JsonObject): { title: string | null; body: string } {
  const title = str(payload['title']);
  const body = str(payload['message']) ?? str(objectField(payload, 'post')['title']) ?? '';
  return { title, body };
}

/** `post:<postId>` for post releases (shared with the background check), else the payload's id. */
const notificationIdOf = (payload: JsonObject, postId: string | null): string | null =>
  postId === null ? str(payload['id']) : postKey(postId);

/** Validate a `creatorNotification` payload; null when there is nothing to show. */
export function parseCreatorNotification(data: unknown): AppNotification | null {
  if (!isJsonObject(data)) {
    return null;
  }
  const postId = postIdOf(data);
  const { title, body } = textOf(data);
  const id = notificationIdOf(data, postId);
  if (id === null || (title === null && body === '')) {
    return null;
  }
  return { id, title: title ?? 'Floatplane', body, creatorId: str(data['creator']), postId };
}

/** The notification for a post found by the background check (same shape as a live one). */
export function notificationForPost(
  video: Pick<Video, 'id' | 'title'>,
  creatorTitle: string | undefined,
  creatorId: string,
): AppNotification {
  return {
    id: postKey(video.id),
    title:
      creatorTitle === undefined || creatorTitle === ''
        ? 'New post'
        : `New post from ${creatorTitle}`,
    body: video.title,
    creatorId,
    postId: video.id,
  };
}
