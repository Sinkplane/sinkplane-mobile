import { renderHook } from '@testing-library/react-native';

import { usePostCache, type CachedPost } from '@/hooks/use-post-cache';
import type { PostComment } from '@/hooks/use-post-comments';
import type { VideoPost } from '@/shared';
import {
  makeComments,
  makeVideo,
  makeVideoPost,
  techCreator,
  techMainChannel,
} from '@test/fixtures';
import { mockFileSystem } from '@test/mocks/expo-file-system';

const CACHE = 'file:///document/post-cache';
const fileOf = (name: string): string => `${CACHE}/${name}.json`;

const post = (id: string): VideoPost =>
  makeVideoPost(makeVideo(techCreator, techMainChannel, { id, title: `Title ${id}` }));
const comments = (id: string): PostComment[] => makeComments(id, 2);

const saved = (name: string): CachedPost =>
  JSON.parse(mockFileSystem.files.get(fileOf(name)) ?? 'null') as CachedPost;

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

describe('usePostCache › saving', () => {
  it('saves the post and its comments, stamped with the time', async () => {
    await renderHook(() => usePostCache('p1', post('p1'), comments('p1')));

    const file = saved('p1');
    expect(file.post.id).toBe('p1');
    expect(file.post.title).toBe('Title p1');
    expect(file.comments.map((comment) => comment.id)).toEqual(['p1-comment-1', 'p1-comment-2']);
    expect(Number.isNaN(Date.parse(file.savedAt))).toBe(false);
    expect(mockFileSystem.directories.has(CACHE)).toBe(true);
  });

  it('saves again when the loaded comments change', async () => {
    const { rerender } = await renderHook(
      ({ list }: { list: PostComment[] }) => usePostCache('p1', post('p1'), list),
      { initialProps: { list: comments('p1').slice(0, 1) } },
    );
    expect(saved('p1').comments).toHaveLength(1);

    await rerender({ list: comments('p1') });
    expect(saved('p1').comments).toHaveLength(2);
  });

  it('saves nothing until the post is there, nor for another post', async () => {
    const { rerender } = await renderHook(
      ({ current }: { current: VideoPost | undefined }) => usePostCache('p1', current, []),
      { initialProps: { current: undefined as VideoPost | undefined } },
    );
    expect(mockFileSystem.files.size).toBe(0);

    await rerender({ current: post('other') });
    expect(mockFileSystem.files.size).toBe(0);

    await rerender({ current: post('p1') });
    expect(mockFileSystem.files.has(fileOf('p1'))).toBe(true);
  });

  it('keeps the saved comments when none loaded this time', async () => {
    mockFileSystem.files.set(
      fileOf('p1'),
      JSON.stringify({ post: post('p1'), comments: comments('p1'), savedAt: day(0) }),
    );
    await renderHook(() => usePostCache('p1', post('p1'), undefined));

    expect(saved('p1').comments).toHaveLength(2);
    expect(saved('p1').savedAt).not.toBe(day(0));
  });

  it('saves an empty list when there are neither loaded nor saved comments', async () => {
    await renderHook(() => usePostCache('p1', post('p1'), undefined));
    expect(saved('p1').comments).toEqual([]);
  });

  it('replaces characters that could leave the directory in the file name', async () => {
    await renderHook(() => usePostCache('../a b', post('../a b'), []));
    expect([...mockFileSystem.files.keys()]).toEqual([fileOf('___a_b')]);
  });

  it('logs a write failure instead of throwing', async () => {
    mockFileSystem.writeError = new Error('disk full');
    await renderHook(() => usePostCache('p1', post('p1'), []));

    expect(errorSpy).toHaveBeenCalledWith(
      '[PostCache] Could not save a post',
      mockFileSystem.writeError,
    );
  });
});

describe('usePostCache › reading', () => {
  it('returns the saved copy', async () => {
    mockFileSystem.files.set(
      fileOf('p1'),
      JSON.stringify({ post: post('p1'), comments: comments('p1'), savedAt: day(3) }),
    );
    const { result } = await renderHook(() => usePostCache('p1', undefined, undefined));

    expect(result.current?.post.title).toBe('Title p1');
    expect(result.current?.comments).toHaveLength(2);
    expect(result.current?.savedAt).toBe(day(3));
  });

  it('returns nothing for a post never saved', async () => {
    const { result } = await renderHook(() => usePostCache('p1', undefined, undefined));
    expect(result.current).toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('reads once per post: a later save does not change the returned copy', async () => {
    const { result, rerender } = await renderHook(
      ({ id }: { id: string }) => usePostCache(id, post(id), comments(id)),
      { initialProps: { id: 'p1' } },
    );
    expect(result.current).toBeUndefined();

    await rerender({ id: 'p1' });
    expect(result.current).toBeUndefined();

    await rerender({ id: 'p2' });
    expect(result.current).toBeUndefined();
    await rerender({ id: 'p1' });
    expect(result.current?.post.id).toBe('p1');
  });

  it.each([
    ['null', 'null'],
    ['without a post', JSON.stringify({ comments: [], savedAt: day(0) })],
    ['without comments', JSON.stringify({ post: post('p1'), savedAt: day(0) })],
    ['without a time', JSON.stringify({ post: post('p1'), comments: [] })],
    ['a null post', JSON.stringify({ post: null, comments: [], savedAt: day(0) })],
    ['a post that is not an object', JSON.stringify({ post: 'p1', comments: [], savedAt: day(0) })],
    [
      'a post without a title',
      JSON.stringify({ post: { id: 'p1' }, comments: [], savedAt: day(0) }),
    ],
    [
      'a post without an id',
      JSON.stringify({ post: { title: 't' }, comments: [], savedAt: day(0) }),
    ],
    [
      'a comment without likes',
      JSON.stringify({
        post: post('p1'),
        comments: [{ id: 'c', text: 't', dislikes: 0, user: { username: 'u' } }],
        savedAt: day(0),
      }),
    ],
    [
      'a comment without dislikes',
      JSON.stringify({
        post: post('p1'),
        comments: [{ id: 'c', text: 't', likes: 0, user: { username: 'u' } }],
        savedAt: day(0),
      }),
    ],
    [
      'a comment whose counts are strings',
      JSON.stringify({
        post: post('p1'),
        comments: [{ id: 'c', text: 't', likes: '1', dislikes: '0', user: { username: 'u' } }],
        savedAt: day(0),
      }),
    ],
    ['a null comment', JSON.stringify({ post: post('p1'), comments: [null], savedAt: day(0) })],
    [
      'a comment that is a string',
      JSON.stringify({ post: post('p1'), comments: ['x'], savedAt: day(0) }),
    ],
    [
      'a comment without an id',
      JSON.stringify({
        post: post('p1'),
        comments: [{ text: 't', user: { username: 'u' } }],
        savedAt: day(0),
      }),
    ],
    [
      'a comment without text',
      JSON.stringify({
        post: post('p1'),
        comments: [{ id: 'c', user: { username: 'u' } }],
        savedAt: day(0),
      }),
    ],
    [
      'a comment without an author',
      JSON.stringify({ post: post('p1'), comments: [{ id: 'c', text: 't' }], savedAt: day(0) }),
    ],
    [
      'a comment whose author has no username',
      JSON.stringify({
        post: post('p1'),
        comments: [{ id: 'c', text: 't', user: {} }],
        savedAt: day(0),
      }),
    ],
  ])('ignores a saved file that is %s', async (_name, text) => {
    mockFileSystem.files.set(fileOf('p1'), text);
    const { result } = await renderHook(() => usePostCache('p1', undefined, undefined));
    expect(result.current).toBeUndefined();
    // Ignored quietly: a damaged copy is not an error worth logging.
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("ignores another post's copy that shares the file name", async () => {
    // 'a b' and 'a_b' are both saved as a_b.json.
    mockFileSystem.files.set(fileOf('a_b'), entry('a b', day(0)));
    const { result } = await renderHook(() => usePostCache('a_b', undefined, undefined));
    expect(result.current).toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('accepts a comment with the fields the list renders', async () => {
    mockFileSystem.files.set(
      fileOf('p1'),
      JSON.stringify({
        post: post('p1'),
        comments: [{ id: 'c', text: 't', likes: 0, dislikes: 0, user: { username: 'u' } }],
        savedAt: day(0),
      }),
    );
    const { result } = await renderHook(() => usePostCache('p1', undefined, undefined));
    expect(result.current?.comments).toHaveLength(1);
  });

  it('logs a file it cannot parse', async () => {
    mockFileSystem.files.set(fileOf('p1'), 'not json');
    await renderHook(() => usePostCache('p1', undefined, undefined));
    expect(errorSpy).toHaveBeenCalledWith(
      '[PostCache] Could not read a saved post',
      expect.any(SyntaxError),
    );
  });
});
