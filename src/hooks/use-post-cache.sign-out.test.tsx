import { renderHook } from '@testing-library/react-native';

import { useClearPostCacheOnSignOut } from '@/hooks/use-post-cache';
import type { VideoPost } from '@/shared';
import { makeVideo, makeVideoPost, techCreator, techMainChannel } from '@test/fixtures';
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

describe('useClearPostCacheOnSignOut', () => {
  const seedCache = (): void => {
    mockFileSystem.directories.add(CACHE);
    mockFileSystem.files.set(fileOf('p1'), entry('p1', day(0)));
    mockFileSystem.files.set(fileOf('p2'), entry('p2', day(1)));
    mockFileSystem.files.set('file:///document/downloads/index.json', '[]');
  };
  const cached = (): string[] =>
    [...mockFileSystem.files.keys()].filter((uri) => uri.startsWith(`${CACHE}/`));

  it('deletes the saved posts (only those) when the session ends', async () => {
    seedCache();
    const { rerender } = await renderHook(
      ({ signedIn }: { signedIn: boolean }) => {
        useClearPostCacheOnSignOut(signedIn);
      },
      { initialProps: { signedIn: true } },
    );
    expect(cached()).toHaveLength(2);

    await rerender({ signedIn: false });
    expect(cached()).toEqual([]);
    expect(mockFileSystem.directories.has(CACHE)).toBe(false);
    expect(mockFileSystem.files.has('file:///document/downloads/index.json')).toBe(true);
  });

  it('does nothing while signed in, or on a launch still loading the session', async () => {
    seedCache();
    const { rerender } = await renderHook(
      ({ signedIn }: { signedIn: boolean }) => {
        useClearPostCacheOnSignOut(signedIn);
      },
      { initialProps: { signedIn: false } },
    );
    expect(cached()).toHaveLength(2);

    // The session loads: signed in (false -> true) keeps them.
    await rerender({ signedIn: true });
    expect(cached()).toHaveLength(2);
    await rerender({ signedIn: true });
    expect(cached()).toHaveLength(2);
  });

  it('clears only once per sign-out, and again for the next one', async () => {
    seedCache();
    const { rerender } = await renderHook(
      ({ signedIn }: { signedIn: boolean }) => {
        useClearPostCacheOnSignOut(signedIn);
      },
      { initialProps: { signedIn: true } },
    );
    await rerender({ signedIn: false });
    mockFileSystem.directories.add(CACHE);
    mockFileSystem.files.set(fileOf('p3'), entry('p3', day(2)));
    await rerender({ signedIn: false });
    expect(cached()).toHaveLength(1);

    await rerender({ signedIn: true });
    await rerender({ signedIn: false });
    expect(cached()).toEqual([]);
  });

  it('does nothing when there is no saved posts directory', async () => {
    const { rerender } = await renderHook(
      ({ signedIn }: { signedIn: boolean }) => {
        useClearPostCacheOnSignOut(signedIn);
      },
      { initialProps: { signedIn: true } },
    );
    await rerender({ signedIn: false });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs a failure to clear instead of throwing', async () => {
    seedCache();
    mockFileSystem.deleteError = new Error('busy');
    const { rerender } = await renderHook(
      ({ signedIn }: { signedIn: boolean }) => {
        useClearPostCacheOnSignOut(signedIn);
      },
      { initialProps: { signedIn: true } },
    );
    await rerender({ signedIn: false });
    expect(errorSpy).toHaveBeenCalledWith(
      '[PostCache] Could not clear the saved posts',
      mockFileSystem.deleteError,
    );
  });
});
