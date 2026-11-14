import {
  QueryClient,
  QueryClientProvider,
  skipToken,
  useQuery,
  type InfiniteData,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  commentReactionState,
  parseCommentReaction,
  useCommentReaction,
  withCommentReaction,
} from '@/hooks/use-comment-reaction';
import { postCommentsKey, type PostComment } from '@/hooks/use-post-comments';
import { makeComments } from '@test/fixtures';

const [first, second] = makeComments('post-1', 2);
if (first === undefined || second === undefined) {
  throw new Error('Expected two fixture comments');
}
const comment: PostComment = { ...first, likes: 5, dislikes: 2 };
const other: PostComment = { ...second, likes: 1, dislikes: 0 };

// -- pure helpers --------------------------------------------------------------------------

describe('parseCommentReaction', () => {
  it('reads Floatplane plain-text answers', () => {
    expect(parseCommentReaction('like')).toBe('like');
    expect(parseCommentReaction(' dislike\n')).toBe('dislike');
  });

  it('reads JSON strings and interaction lists', () => {
    expect(parseCommentReaction('"like"')).toBe('like');
    expect(parseCommentReaction('["dislike"]')).toBe('dislike');
    expect(parseCommentReaction('[]')).toBeNull();
  });

  it('treats anything else as no reaction', () => {
    expect(parseCommentReaction('')).toBeNull();
    expect(parseCommentReaction('removed')).toBeNull();
    expect(parseCommentReaction('{"liked":true}')).toBeNull();
  });
});

describe('commentReactionState', () => {
  it("reads the user's reaction and counters from the comment", () => {
    expect(commentReactionState({ ...comment, userInteraction: ['like'] })).toEqual({
      reaction: 'like',
      likes: 5,
      dislikes: 2,
    });
    expect(commentReactionState({ ...comment, userInteraction: null }).reaction).toBeNull();
    const withoutInteraction: PostComment = { ...comment };
    delete withoutInteraction.userInteraction;
    expect(commentReactionState(withoutInteraction).reaction).toBeNull();
  });
});

describe('withCommentReaction', () => {
  it('adds, switches and removes the reaction, adjusting both counters', () => {
    const liked = withCommentReaction(comment, 'like');
    expect(liked).toMatchObject({ likes: 6, dislikes: 2, userInteraction: ['like'] });

    const disliked = withCommentReaction(liked, 'dislike');
    expect(disliked).toMatchObject({ likes: 5, dislikes: 3, userInteraction: ['dislike'] });

    expect(withCommentReaction(disliked, null)).toMatchObject({
      likes: 5,
      dislikes: 2,
      userInteraction: [],
    });
  });
});

// -- the hook ------------------------------------------------------------------------------

const TOKEN = 'session-token';
const AUTHORIZATION = 'Authorization';
type Pages = InfiniteData<PostComment[], string | undefined>;

interface ToggleAnswer {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}

const queryClients: QueryClient[] = [];
afterEach(() => {
  queryClients.forEach((client) => {
    client.clear();
  });
  queryClients.length = 0;
});

/** Comment toggles answered in order by `answers` (`{ status, body }`; default 200 `like`). */
function scriptFetch(answers: { status: number; body: string }[]) {
  const fetch = jest.fn((): Promise<ToggleAnswer> => {
    const { status, body } = answers.shift() ?? { status: 200, body: 'like' };
    return Promise.resolve({ ok: status === 200, status, text: () => Promise.resolve(body) });
  });
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
  return fetch;
}

async function renderReaction(
  token: string | null,
  answers: { status: number; body: string }[] = [],
) {
  const fetch = scriptFetch(answers);
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false, gcTime: Infinity } },
  });
  queryClients.push(queryClient);
  const key = postCommentsKey(token, comment.blogPost);
  queryClient.setQueryData<Pages>(key, { pages: [[comment], [other]], pageParams: [undefined] });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const cached = () => queryClient.getQueryData<Pages>(key)?.pages.flat() ?? [];
  // Like the comment list, the hook is handed the comment from the (subscribed) cached pages.
  const utils = await renderHook(
    () => {
      const pages = useQuery<Pages>({ queryKey: key, queryFn: skipToken });
      const current = pages.data?.pages.flat().find((c) => c.id === comment.id) ?? comment;
      return useCommentReaction(token, current);
    },
    { wrapper },
  );
  return { ...utils, fetch, cached };
}

const toggle = (
  result: { current: ReturnType<typeof useCommentReaction> },
  kind: 'like' | 'dislike',
) =>
  act(() => {
    result.current.toggle(kind);
  });

describe('useCommentReaction', () => {
  it('posts the toggle for the comment and its post', async () => {
    const { result, fetch } = await renderReaction(TOKEN);

    await toggle(result, 'dislike');

    expect(fetch).toHaveBeenCalledWith(
      'https://www.floatplane.com/api/v3/comment/dislike',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ [AUTHORIZATION]: `Bearer ${TOKEN}` }) as unknown,
        body: JSON.stringify({ comment: comment.id, blogPost: comment.blogPost }),
      }),
    );
  });

  it('patches the confirmed reaction into the cached comment only', async () => {
    const { result, cached } = await renderReaction(TOKEN, [
      { status: 200, body: 'like' },
      { status: 200, body: '' },
    ]);

    await toggle(result, 'like');
    await waitFor(() => {
      expect(result.current).toMatchObject({ reaction: 'like', likes: 6, dislikes: 2 });
    });
    expect(cached()[1]).toEqual(other);

    await toggle(result, 'like');
    await waitFor(() => {
      expect(result.current).toMatchObject({ reaction: null, likes: 5, dislikes: 2 });
    });
    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });

  it('reports a failed toggle and leaves the comment unchanged', async () => {
    const { result } = await renderReaction(TOKEN, [{ status: 500, body: 'nope' }]);

    await toggle(result, 'like');

    await waitFor(() => {
      expect(result.current.error?.message).toBe('Failed to like comment: 500 - nope');
    });
    expect(result.current).toMatchObject({ reaction: null, likes: 5 });
  });

  it('does nothing without a session token', async () => {
    const { result, fetch } = await renderReaction(null);

    await toggle(result, 'like');

    expect(fetch).not.toHaveBeenCalled();
  });

  it('ignores presses while a toggle is in flight', async () => {
    const { result } = await renderReaction(TOKEN);
    const hanging = jest.fn((): Promise<Response> => new Promise(jest.fn()));
    globalThis.fetch = hanging;

    await toggle(result, 'like');
    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });
    await toggle(result, 'dislike');

    expect(hanging).toHaveBeenCalledTimes(1);
  });
});
