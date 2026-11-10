import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { applyReaction, getReaction, usePostReaction } from '@/hooks/use-post-reaction';
import { makeVideo, techCreator, techMainChannel } from '@test/fixtures';
import type { VideoPost } from '@/shared';

const video = makeVideo(techCreator, techMainChannel, { id: 'post-1', title: 'The Post' });
const post = { ...video, videoAttachments: [] } as unknown as VideoPost;

// -- pure helpers --------------------------------------------------------------------------

type Interactions = Parameters<typeof getReaction>[0];
const withInteractions = (
  userInteraction: unknown[] | undefined,
  selfUserInteraction: unknown = null,
) => ({ userInteraction, selfUserInteraction }) as unknown as Interactions;

describe('getReaction', () => {
  it('reads the reaction from userInteraction strings', () => {
    expect(getReaction(withInteractions(['like']))).toBe('like');
    expect(getReaction(withInteractions(['dislike']))).toBe('dislike');
  });

  it('reads object-form userInteraction entries', () => {
    expect(getReaction(withInteractions([{ liked: true, disliked: false }]))).toBe('like');
    expect(getReaction(withInteractions([{ liked: false, disliked: true }]))).toBe('dislike');
    expect(getReaction(withInteractions([{ liked: false, disliked: false }]))).toBeNull();
  });

  it('falls back to selfUserInteraction flags', () => {
    expect(
      getReaction(withInteractions([], { liked: true, disliked: false, favorited: false })),
    ).toBe('like');
    expect(
      getReaction(withInteractions([], { liked: false, disliked: true, favorited: false })),
    ).toBe('dislike');
  });

  it('prefers like when both are somehow present, and null when neither is', () => {
    expect(getReaction(withInteractions(['like', 'dislike']))).toBe('like');
    expect(getReaction(withInteractions([]))).toBeNull();
    expect(getReaction(withInteractions(undefined))).toBeNull();
  });
});

describe('applyReaction', () => {
  const base = { reaction: null, likes: 10, dislikes: 2 };

  it('adds a like', () => {
    expect(applyReaction(base, 'like')).toEqual({ reaction: 'like', likes: 11, dislikes: 2 });
  });

  it('adds a dislike', () => {
    expect(applyReaction(base, 'dislike')).toEqual({ reaction: 'dislike', likes: 10, dislikes: 3 });
  });

  it('removes the active reaction when toggled off', () => {
    expect(applyReaction({ reaction: 'like', likes: 11, dislikes: 2 }, null)).toEqual({
      reaction: null,
      likes: 10,
      dislikes: 2,
    });
    expect(applyReaction({ reaction: 'dislike', likes: 10, dislikes: 3 }, null)).toEqual({
      reaction: null,
      likes: 10,
      dislikes: 2,
    });
  });

  it('switches between like and dislike, adjusting both counters', () => {
    expect(applyReaction({ reaction: 'like', likes: 11, dislikes: 2 }, 'dislike')).toEqual({
      reaction: 'dislike',
      likes: 10,
      dislikes: 3,
    });
    expect(applyReaction({ reaction: 'dislike', likes: 10, dislikes: 3 }, 'like')).toEqual({
      reaction: 'like',
      likes: 11,
      dislikes: 2,
    });
  });
});

// -- the hook ------------------------------------------------------------------------------

const TOKEN = 'session-token';
const AUTHORIZATION = 'Authorization';

interface OkResult {
  ok: true;
  status: 200;
  json: () => Promise<string[]>;
  text: () => Promise<string>;
}
interface ErrorResult {
  ok: false;
  status: number;
  json: () => Promise<never>;
  text: () => Promise<string>;
}

interface RenderOptions {
  token?: string | null;
  /** The post the hook sees (omitted → no post). */
  post?: VideoPost;
  /** Scripted toggle responses, consumed in order; defaults to "removed" (`[]`). */
  responses?: (string[] | ErrorResult)[];
}

const queryClients: QueryClient[] = [];
afterEach(() => {
  queryClients.forEach((client) => {
    client.clear();
  });
  queryClients.length = 0;
});

/** Render the hook with a scripted /api/v3/content/{like,dislike} standing in for fetch. */
async function renderReaction(options: RenderOptions = {}) {
  const fetch = jest.fn((): Promise<OkResult | ErrorResult> => {
    const next = options.responses?.shift() ?? [];
    if (!Array.isArray(next)) {
      return Promise.resolve(next);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(next),
      text: () => Promise.resolve(JSON.stringify(next)),
    });
  });
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;

  // gcTime Infinity: a settled mutation's 5-minute GC timer would otherwise keep the
  // jest worker alive after the run (queryClient.clear() does not cancel it).
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false, gcTime: Infinity } },
  });
  queryClients.push(queryClient);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const utils = await renderHook(
    ({ token, post: activePost }: { token: string | null; post?: VideoPost | undefined }) =>
      usePostReaction(token, activePost),
    {
      wrapper,
      initialProps: {
        token: options.token === undefined ? TOKEN : options.token,
        post: options.post,
      },
    },
  );
  return { ...utils, fetch };
}

const toggle = (
  result: { current: ReturnType<typeof usePostReaction> },
  kind: 'like' | 'dislike',
) =>
  act(() => {
    result.current.toggle(kind);
  });

describe('usePostReaction', () => {
  it('derives its state from the post', async () => {
    const liked = { ...post, userInteraction: ['like'] } as unknown as VideoPost;
    const { result, fetch } = await renderReaction({ post: liked });

    expect(result.current).toMatchObject({
      reaction: 'like',
      likes: post.likes,
      dislikes: post.dislikes,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('derives its state from an object-form userInteraction', async () => {
    const disliked = {
      ...post,
      userInteraction: [{ liked: false, disliked: true }],
    } as unknown as VideoPost;
    const { result } = await renderReaction({ post: disliked });
    expect(result.current.reaction).toBe('dislike');
  });

  it('starts empty without a post', async () => {
    const { result } = await renderReaction();
    expect(result.current).toMatchObject({ reaction: null, likes: 0, dislikes: 0 });
  });

  it('applies the server-confirmed reaction and counters on like', async () => {
    const { result, fetch } = await renderReaction({ post, responses: [['like']] });

    await toggle(result, 'like');

    expect(fetch).toHaveBeenCalledWith(
      'https://www.floatplane.com/api/v3/content/like',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ [AUTHORIZATION]: `Bearer ${TOKEN}` }) as unknown,
        body: JSON.stringify({ id: post.id, contentType: 'blogPost' }),
      }),
    );
    expect(result.current).toMatchObject({
      reaction: 'like',
      likes: post.likes + 1,
      dislikes: post.dislikes,
    });
    expect(result.current.isPending).toBe(false);
  });

  it('like → like removes it; like → dislike switches', async () => {
    const { result } = await renderReaction({
      post,
      responses: [['like'], [], ['like'], ['dislike']],
    });
    await toggle(result, 'like');

    await toggle(result, 'like');
    expect(result.current).toMatchObject({
      reaction: null,
      likes: post.likes,
      dislikes: post.dislikes,
    });

    await toggle(result, 'like');
    await toggle(result, 'dislike');
    expect(result.current).toMatchObject({
      reaction: 'dislike',
      likes: post.likes,
      dislikes: post.dislikes + 1,
    });
  });

  it('keeps the confirmed state for the same post across rerenders', async () => {
    const { result, rerender } = await renderReaction({ post, responses: [['like']] });
    await toggle(result, 'like');

    await rerender({ token: TOKEN, post });
    expect(result.current.reaction).toBe('like');
  });

  it('discards the confirmed state when navigating to another post', async () => {
    const other = { ...post, id: 'post-2', userInteraction: ['dislike'] } as unknown as VideoPost;
    const { result, rerender } = await renderReaction({ post, responses: [['like']] });
    await toggle(result, 'like');

    await rerender({ token: TOKEN, post: other });
    expect(result.current.reaction).toBe('dislike');
    expect(result.current.likes).toBe(other.likes);
  });

  it('surfaces a failed toggle as an error without changing state', async () => {
    const { result } = await renderReaction({
      post,
      responses: [
        {
          ok: false,
          status: 500,
          json: () => Promise.reject(new Error('x')),
          text: () => Promise.resolve('boom'),
        },
      ],
    });

    await toggle(result, 'like');

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    expect(result.current.error).toEqual(new Error('Failed to like post: 500 - boom'));
    expect(result.current.reaction).toBeNull();
    expect(result.current.likes).toBe(post.likes);
  });

  it('ignores toggles without a token or post', async () => {
    const { result: signedOut, fetch: signedOutFetch } = await renderReaction({
      token: null,
      post,
    });
    await act(() => {
      signedOut.current.toggle('like');
    });
    expect(signedOutFetch).not.toHaveBeenCalled();

    const { result: postless, fetch: postlessFetch } = await renderReaction({
      responses: [['like']],
    });
    await act(() => {
      postless.current.toggle('like');
    });
    expect(postlessFetch).not.toHaveBeenCalled();
  });

  it('ignores a second toggle while one is in flight', async () => {
    let resolveToggle!: (body: string[]) => void;
    const { result, fetch } = await renderReaction({ post });
    fetch.mockImplementationOnce(
      () =>
        new Promise<OkResult>((resolve) => {
          resolveToggle = (body) => {
            resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve(body),
              text: () => Promise.resolve(''),
            });
          };
        }),
    );

    await act(() => {
      result.current.toggle('like');
    });
    // The pending state lands a tick after mutate() — wait for it before trying again.
    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    await act(() => {
      result.current.toggle('dislike'); // in flight → dropped
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(() => {
      resolveToggle(['like']);
    });
    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
    expect(result.current.reaction).toBe('like');
  });
});
