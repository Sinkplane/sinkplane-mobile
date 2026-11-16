import { Directory, File, Paths } from 'expo-file-system';

import { logError } from '@/utils/log';

/**
 * Downloaded videos live in the app's documents directory (backed up like user data, never
 * purged by the OS), one `<postId>.mp4` per post plus an optional `<postId>.jpg` thumbnail, and
 * an `index.json` describing them so the Downloads screen works offline.
 */
const LIBRARY_DIR = 'downloads';
const INDEX_FILE = 'index.json';

export interface DownloadedVideo {
  readonly postId: string;
  readonly title: string;
  readonly channel?: string;
  /** The quality that was downloaded ("1080p"). */
  readonly label: string;
  readonly sizeBytes: number;
  readonly durationSeconds?: number;
  /** ISO time the download finished. */
  readonly downloadedAt: string;
  readonly hasThumbnail: boolean;
}

/** Post ids are alphanumeric; anything else is replaced so an id can never leave the directory. */
const safeName = (postId: string): string => postId.replace(/[^\w-]/g, '_');

function libraryDirectory(): Directory {
  const directory = new Directory(Paths.document, LIBRARY_DIR);
  directory.create({ idempotent: true, intermediates: true });
  return directory;
}

export function videoFileFor(postId: string): File {
  return new File(libraryDirectory(), `${safeName(postId)}.mp4`);
}

/** Where the transfer writes until it completes, so a half-written file is never listed. */
export function partialFileFor(postId: string): File {
  return new File(libraryDirectory(), `${safeName(postId)}.mp4.part`);
}

export function thumbnailFileFor(postId: string): File {
  return new File(libraryDirectory(), `${safeName(postId)}.jpg`);
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** The fields an index entry must have to be listed (the rest are optional). */
const REQUIRED_FIELDS: Readonly<Record<string, (value: unknown) => boolean>> = {
  postId: isString,
  title: isString,
  label: isString,
  sizeBytes: isNumber,
  downloadedAt: isString,
};

function isEntry(value: unknown): value is DownloadedVideo {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return Object.entries(REQUIRED_FIELDS).every(([field, check]) => check(entry[field]));
}

function parseIndex(text: string): DownloadedVideo[] {
  const parsed: unknown = JSON.parse(text);
  return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
}

/** The downloads whose video file is still on disk (a missing or unreadable index reads empty). */
export function readLibrary(): DownloadedVideo[] {
  try {
    const index = new File(libraryDirectory(), INDEX_FILE);
    if (!index.exists) {
      return [];
    }
    return parseIndex(index.textSync()).filter((entry) => videoFileFor(entry.postId).exists);
  } catch (error) {
    logError('[Downloads] Could not read the downloads index', error);
    return [];
  }
}

export function writeLibrary(entries: readonly DownloadedVideo[]): void {
  try {
    new File(libraryDirectory(), INDEX_FILE).writeSync(JSON.stringify(entries));
  } catch (error) {
    logError('[Downloads] Could not write the downloads index', error);
  }
}

export function deleteIfPresent(file: File): void {
  if (file.exists) {
    file.delete();
  }
}

/** Removes a post's video, thumbnail and any half-written transfer. */
export function deleteDownloadFiles(postId: string): void {
  for (const file of [videoFileFor(postId), thumbnailFileFor(postId), partialFileFor(postId)]) {
    try {
      deleteIfPresent(file);
    } catch (error) {
      logError('[Downloads] Could not delete a downloaded file', error);
    }
  }
}

/** Where the player and the photo library read a downloaded video from. */
export function downloadedVideoUri(video: DownloadedVideo): string {
  return videoFileFor(video.postId).uri;
}

/** The saved thumbnail, when the download kept one. */
export function downloadedThumbnailUri(video: DownloadedVideo): string | undefined {
  return video.hasThumbnail ? thumbnailFileFor(video.postId).uri : undefined;
}
