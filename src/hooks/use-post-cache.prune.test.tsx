import { renderHook } from '@testing-library/react-native';

import { usePostCache } from '@/hooks/use-post-cache';
import type { VideoPost } from '@/shared';
import { makeVideo, makeVideoPost, techCreator, techMainChannel } from '@test/fixtures';
import { makeDownloadedVideo, seedDownloads } from '@test/fixtures-downloads';
import { mockFileSystem } from '@test/mocks/expo-file-system';

const CACHE = 'file:///document/post-cache';
const fileOf = (name: string): string => `${CACHE}/${name}.json`;

const post = (id: string): VideoPost =>
  makeVideoPost(makeVideo(techCreator, techMainChannel, { id, title: `Title ${id}` }));
const entry = (id: string, savedAt: string): string =>
  JSON.stringify({ post: post(id), comments: [], savedAt });
const day = (n: number): string => new Date(Date.UTC(2026, 0, 1 + n)).toISOString();

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('usePostCache › pruning', () => {
  const MAX = 100;

  function seedPosts(count: number): void {
    for (let i = 0; i < count; i += 1) {
      const id = `p${String(i).padStart(3, '0')}`;
      mockFileSystem.files.set(fileOf(id), entry(id, day(i + 1)));
    }
  }

  it('keeps everything up to the limit', async () => {
    seedPosts(MAX - 1);
    await renderHook(() => usePostCache('fresh', post('fresh'), []));
    expect([...mockFileSystem.files.keys()]).toHaveLength(MAX);
    expect(mockFileSystem.files.has(fileOf('p000'))).toBe(true);
  });

  it('drops the oldest beyond the limit, never a downloaded video’s, and unreadable ones first', async () => {
    seedPosts(MAX);
    mockFileSystem.files.set(fileOf('old-download'), entry('old-download', day(0)));
    seedDownloads(mockFileSystem, [makeDownloadedVideo({ postId: 'old-download' })]);
    mockFileSystem.files.set(fileOf('broken'), 'garbage');
    mockFileSystem.files.set(fileOf('malformed'), '{}');
    mockFileSystem.files.set(`${CACHE}/notes.txt`, 'not a saved post');

    await renderHook(() => usePostCache('fresh', post('fresh'), []));

    const names = [...mockFileSystem.files.keys()]
      .filter((uri) => uri.startsWith(`${CACHE}/`))
      .map((uri) => uri.slice(CACHE.length + 1));
    // 100 + download + broken + malformed + fresh = 104 saved posts: four go (the two
    // unreadable ones first, then the two oldest).
    expect(names.filter((name) => name.endsWith('.json'))).toHaveLength(MAX);
    expect(names).not.toContain('broken.json');
    expect(names).not.toContain('malformed.json');
    expect(names).not.toContain('p000.json');
    expect(names).not.toContain('p001.json');
    expect(names).toContain('p002.json');
    expect(names).toContain('old-download.json');
    expect(names).toContain('fresh.json');
    expect(names).toContain('notes.txt');
  });

  it('logs a failure while pruning instead of throwing', async () => {
    seedPosts(MAX);
    mockFileSystem.listError = new Error('no access');
    await renderHook(() => usePostCache('fresh', post('fresh'), []));
    expect(errorSpy).toHaveBeenCalledWith(
      '[PostCache] Could not save a post',
      mockFileSystem.listError,
    );
  });
});
