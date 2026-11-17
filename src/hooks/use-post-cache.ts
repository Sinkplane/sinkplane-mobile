import { useEffect, useMemo, useRef } from 'react';
import { Directory, File, Paths } from 'expo-file-system';

import type { PostComment } from '@/hooks/use-post-comments';
import type { VideoPost } from '@/shared';
import { readLibrary } from '@/utils/download-library';
import { logError } from '@/utils/log';

/**
 * Video pages work offline from what they showed last time: every opened post is saved (details,
 * reactions and the comments that were loaded) as `<postId>.json` in the documents directory. The
 * most recently opened ones are kept, plus every downloaded video's.
 */
const CACHE_DIR = 'post-cache';
const MAX_CACHED_POSTS = 100;
const JSON_SUFFIX = '.json';

export interface CachedPost {
  readonly post: VideoPost;
  readonly comments: readonly PostComment[];
  /** ISO time it was saved (the oldest go first). */
  readonly savedAt: string;
}

/** Post ids are alphanumeric; anything else is replaced so an id can never leave the directory. */
const safeName = (postId: string): string => postId.replace(/[^\w-]/g, '_');

function cacheDirectory(): Directory {
  const directory = new Directory(Paths.document, CACHE_DIR);
  directory.create({ idempotent: true, intermediates: true });
  return directory;
}

const cacheFileFor = (postId: string): File =>
  new File(cacheDirectory(), `${safeName(postId)}${JSON_SUFFIX}`);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasCounts = (comment: Record<string, unknown>): boolean =>
  typeof comment['likes'] === 'number' && typeof comment['dislikes'] === 'number';

/** A comment the list can render (id, text, author, reaction counts). */
function isComment(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['text'] === 'string' &&
    hasCounts(value) &&
    isRecord(value['user']) &&
    typeof value['user']['username'] === 'string'
  );
}

/** A post the page can render (id and title). */
function isPost(value: unknown): boolean {
  return isRecord(value) && typeof value['id'] === 'string' && typeof value['title'] === 'string';
}

function isEntry(value: unknown): value is CachedPost {
  return (
    isRecord(value) &&
    isPost(value['post']) &&
    typeof value['savedAt'] === 'string' &&
    Array.isArray(value['comments']) &&
    value['comments'].every(isComment)
  );
}

/** The saved entry, if it is well-formed (a damaged file is ignored rather than rendered). */
function parseEntry(file: File): CachedPost | undefined {
  const entry: unknown = JSON.parse(file.textSync());
  return isEntry(entry) ? entry : undefined;
}

/** The saved post, or undefined when there is none (or it can't be read). */
function readCachedPost(postId: string): CachedPost | undefined {
  try {
    const file = cacheFileFor(postId);
    const entry = file.exists ? parseEntry(file) : undefined;
    // Only this post's own copy (two ids can share a file name after `safeName`).
    return entry?.post.id === postId ? entry : undefined;
  } catch (error) {
    logError('[PostCache] Could not read a saved post', error);
    return undefined;
  }
}

function savedAtOf(file: File): string {
  try {
    return parseEntry(file)?.savedAt ?? '';
  } catch {
    // Unreadable: the first to go.
    return '';
  }
}

/** Deletes the oldest saved posts beyond the limit; downloaded videos' are always kept. */
function prune(): void {
  const files = cacheDirectory()
    .list()
    .filter((item): item is File => item instanceof File && item.name.endsWith(JSON_SUFFIX));
  if (files.length <= MAX_CACHED_POSTS) {
    return;
  }
  const downloaded = new Set(
    readLibrary().map((video) => `${safeName(video.postId)}${JSON_SUFFIX}`),
  );
  const oldestFirst = files
    .filter((file) => !downloaded.has(file.name))
    .map((file) => ({ file, savedAt: savedAtOf(file) }))
    .sort((a, b) => a.savedAt.localeCompare(b.savedAt));
  for (const { file } of oldestFirst.slice(0, files.length - MAX_CACHED_POSTS)) {
    file.delete();
  }
}

function writeCachedPost(entry: CachedPost): void {
  try {
    cacheFileFor(entry.post.id).writeSync(JSON.stringify(entry));
    prune();
  } catch (error) {
    logError('[PostCache] Could not save a post', error);
  }
}

/**
 * The post's saved copy (read once per post), and saves the post again whenever it or its loaded
 * comments change. Comments not loaded this time keep the saved ones.
 */
export function usePostCache(
  postId: string,
  post: VideoPost | undefined,
  comments: readonly PostComment[] | undefined,
): CachedPost | undefined {
  const cached = useMemo(() => readCachedPost(postId), [postId]);
  useEffect(() => {
    if (post?.id !== postId) {
      return;
    }
    writeCachedPost({
      post,
      comments: comments ?? cached?.comments ?? [],
      savedAt: new Date().toISOString(),
    });
  }, [postId, post, comments, cached]);
  return cached;
}

/** Deletes every saved post: they hold the signed-in account's reactions and progress. */
function clearPostCache(): void {
  try {
    const directory = new Directory(Paths.document, CACHE_DIR);
    if (directory.exists) {
      directory.delete();
    }
  } catch (error) {
    logError('[PostCache] Could not clear the saved posts', error);
  }
}

/**
 * Signing out (a signed-in session ending, not a launch that's still loading it) clears the saved
 * posts, so the next account never sees this one's.
 */
export function useClearPostCacheOnSignOut(signedIn: boolean): void {
  const wasSignedIn = useRef(signedIn);
  useEffect(() => {
    if (wasSignedIn.current && !signedIn) {
      clearPostCache();
    }
    wasSignedIn.current = signedIn;
  }, [signedIn]);
}
