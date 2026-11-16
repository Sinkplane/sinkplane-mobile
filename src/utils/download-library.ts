import { Directory, File, Paths } from 'expo-file-system';

import { logError } from '@/utils/log';

/**
 * Downloaded videos live in the app's documents directory (backed up like user data, never
 * purged by the OS), one `<postId>.mp4` per post plus an optional `<postId>.jpg` thumbnail, and
 * an `index.json` describing them so the Downloads screen works offline.
 */
const LIBRARY_DIR = 'downloads';
const INDEX_FILE = 'index.json';
const TEMPORARY_INDEX_FILE = 'index.json.tmp';

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

const PARTIAL_SUFFIX = '.part';

/**
 * Where one transfer writes until it completes, so a half-written file is never listed. `transfer`
 * makes the name unique, so a cancelled transfer's cleanup can't touch a restarted one's file.
 */
export function partialFileFor(postId: string, transfer: string): File {
  return new File(libraryDirectory(), `${safeName(postId)}.${transfer}${PARTIAL_SUFFIX}`);
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
/**
 * The index, or its replacement when the app stopped between `writeLibrary` deleting the old index
 * and renaming the new one (the replacement is complete by then).
 */
function indexFile(directory: Directory): File | undefined {
  return [new File(directory, INDEX_FILE), new File(directory, TEMPORARY_INDEX_FILE)].find(
    (file) => file.exists,
  );
}

export function readLibrary(): DownloadedVideo[] {
  try {
    const index = indexFile(libraryDirectory());
    if (index === undefined) {
      return [];
    }
    return parseIndex(index.textSync()).filter((entry) => videoFileFor(entry.postId).exists);
  } catch (error) {
    logError('[Downloads] Could not read the downloads index', error);
    return [];
  }
}

/**
 * Replaces the index atomically (a temporary file renamed over it), so an interrupted write never
 * leaves a truncated index. False when it couldn't be written.
 */
export function writeLibrary(entries: readonly DownloadedVideo[]): boolean {
  try {
    const directory = libraryDirectory();
    const index = new File(directory, INDEX_FILE);
    const temporary = new File(directory, TEMPORARY_INDEX_FILE);
    if (!index.exists && temporary.exists) {
      // A recovered replacement (see indexFile) is the only good copy: keep it before rewriting.
      temporary.moveSync(index);
    }
    temporary.writeSync(JSON.stringify(entries));
    temporary.moveSync(index, { overwrite: true });
    return true;
  } catch (error) {
    logError('[Downloads] Could not write the downloads index', error);
    return false;
  }
}

/**
 * Deletes half-written transfers an earlier run left behind (transfers don't survive the app being
 * terminated). Only call it while no transfer is running.
 */
export function deleteAbandonedTransfers(): void {
  try {
    for (const entry of libraryDirectory().list()) {
      if (entry instanceof File && entry.name.endsWith(PARTIAL_SUFFIX)) {
        deleteQuietly(entry);
      }
    }
  } catch (error) {
    logError('[Downloads] Could not list the downloads directory', error);
  }
}

export function deleteIfPresent(file: File): void {
  if (file.exists) {
    file.delete();
  }
}

/** Deletes the file if it's there; false (logged) when it couldn't be deleted. */
function deleteQuietly(file: File): boolean {
  try {
    deleteIfPresent(file);
    return true;
  } catch (error) {
    logError('[Downloads] Could not delete a downloaded file', error);
    return false;
  }
}

/**
 * Removes a post's video, then its thumbnail. False when the video couldn't be deleted (the
 * thumbnail is then kept too, so the download stays listed as it was).
 */
export function deleteDownloadFiles(postId: string): boolean {
  if (!deleteQuietly(videoFileFor(postId))) {
    return false;
  }
  deleteQuietly(thumbnailFileFor(postId));
  return true;
}

/** Where the player and the photo library read a downloaded video from. */
export function downloadedVideoUri(video: DownloadedVideo): string {
  return videoFileFor(video.postId).uri;
}

/** The saved thumbnail, when the download kept one. */
export function downloadedThumbnailUri(video: DownloadedVideo): string | undefined {
  return video.hasThumbnail ? thumbnailFileFor(video.postId).uri : undefined;
}
