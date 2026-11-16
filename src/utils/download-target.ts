/** What a download needs to know about a post, from either a post page or a list item. */
export interface DownloadTarget {
  readonly postId: string;
  readonly title: string;
  readonly channel?: string | undefined;
  readonly thumbnailUrl?: string | undefined;
  readonly durationSeconds?: number | undefined;
  /** The post's first video attachment, whose qualities are offered. */
  readonly attachmentId: string;
}

/** A video attachment: an object on the post endpoint, a bare id in post lists. */
type LooseAttachment = string | { readonly guid?: string; readonly duration?: number };

/** The fields as the post and list endpoints may send them (any of them can be missing). */
export interface DownloadablePost {
  readonly id: string;
  readonly title: string;
  readonly channel?: unknown;
  readonly thumbnail?: { readonly path?: string } | null;
  readonly videoAttachments?: readonly LooseAttachment[] | null;
  readonly metadata?: { readonly videoDuration?: number } | null;
}

function channelTitle(channel: unknown): string | undefined {
  if (typeof channel !== 'object' || channel === null || !('title' in channel)) {
    return undefined;
  }
  return typeof channel.title === 'string' ? channel.title : undefined;
}

function attachmentOf(post: DownloadablePost) {
  const attachment = post.videoAttachments?.[0];
  if (typeof attachment === 'string') {
    return { id: attachment, duration: undefined };
  }
  const id = attachment?.guid;
  return id === undefined ? undefined : { id, duration: attachment?.duration };
}

/** The attachment's duration, else the post's; a zero (not yet processed) counts as unknown. */
function durationOf(post: DownloadablePost, attachmentDuration: number | undefined) {
  const duration = attachmentDuration ?? post.metadata?.videoDuration;
  return duration !== undefined && duration > 0 ? duration : undefined;
}

/** The post's download target; undefined for posts without a video (image / text posts). */
export function downloadTargetOf(post: DownloadablePost): DownloadTarget | undefined {
  const attachment = attachmentOf(post);
  if (attachment === undefined) {
    return undefined;
  }
  return {
    postId: post.id,
    title: post.title,
    channel: channelTitle(post.channel),
    thumbnailUrl: post.thumbnail?.path,
    durationSeconds: durationOf(post, attachment.duration),
    attachmentId: attachment.id,
  };
}
