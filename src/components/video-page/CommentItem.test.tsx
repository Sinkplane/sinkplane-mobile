import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CommentItem } from '@/components/video-page/CommentItem';
import { FIXED_NOW, makeComments } from '@test/fixtures';

const comments = makeComments('post-1', 2);

function commentAt(index: number) {
  const found = comments[index];
  if (found === undefined) {
    throw new Error(`No fixture comment at ${String(index)}`);
  }
  return found;
}

const comment = commentAt(0);
const replyless = commentAt(1);

const queryClients: QueryClient[] = [];

async function renderComment(
  overrides: Partial<Parameters<typeof CommentItem>[0]['comment']> = {},
) {
  // gcTime Infinity: a settled mutation's GC timer would otherwise keep the worker alive.
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false, gcTime: Infinity } },
  });
  queryClients.push(queryClient);
  await render(
    <QueryClientProvider client={queryClient}>
      <CommentItem comment={{ ...comment, ...overrides }} token="session-token" />
    </QueryClientProvider>,
  );
}

/** Stands in for fetch: every comment toggle answers with `status` and `body`. */
function answerToggles(status: number, body: string) {
  const fetch = jest.fn(() =>
    Promise.resolve({ ok: status === 200, status, text: () => Promise.resolve(body) }),
  );
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
  return fetch;
}

describe('CommentItem', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: FIXED_NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
    queryClients.forEach((client) => {
      client.clear();
    });
    queryClients.length = 0;
  });

  it('renders the author, age, text, reactions and replies', async () => {
    await renderComment({ likes: 4, dislikes: 1 });

    expect(screen.getByTestId('comment-post-1-comment-1')).toBeTruthy();
    expect(screen.getByText('@commenter1 · 1 minute ago')).toBeTruthy();
    expect(screen.getByText('Comment number 1 on post-1')).toBeTruthy();
    expect(screen.getByTestId('comment-post-1-comment-1-like-count')).toHaveTextContent('4');
    expect(screen.getByTestId('comment-post-1-comment-1-dislike-count')).toHaveTextContent('1');
    expect(screen.getByText('2 replies')).toBeTruthy();
  });

  it("shows the signed-in user's reaction as selected", async () => {
    await renderComment({ userInteraction: ['dislike'] });

    expect(screen.getByRole('button', { name: 'Dislike comment, 0' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Like comment, 0' })).not.toBeSelected();
  });

  it('sends the like for this comment and its post when the like button is pressed', async () => {
    const fetch = answerToggles(200, 'like');
    await renderComment();

    await fireEvent.press(screen.getByTestId('comment-post-1-comment-1-like'));

    expect(fetch).toHaveBeenCalledWith(
      'https://www.floatplane.com/api/v3/comment/like',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ comment: 'post-1-comment-1', blogPost: 'post-1' }),
      }),
    );
    expect(screen.queryByText("Couldn't save your reaction. Try again.")).toBeNull();
  });

  it('explains when saving the reaction fails', async () => {
    answerToggles(500, 'nope');
    await renderComment();

    await fireEvent.press(screen.getByTestId('comment-post-1-comment-1-dislike'));

    expect(await screen.findByText("Couldn't save your reaction. Try again.")).toBeTruthy();
    expect(screen.getByTestId('comment-post-1-comment-1-dislike-count')).toHaveTextContent('0');
  });

  it('omits the replies note and avatar when there are none', async () => {
    await renderComment({ ...replyless, id: replyless.id });

    expect(screen.queryByText(/repl/)).toBeNull();
    expect(screen.queryByTestId('comment-post-1-comment-1')).toBeNull();
    expect(screen.getByTestId('comment-post-1-comment-2')).toBeTruthy();
  });

  it('says 1 reply for a single reply and shows the avatar when there is one', async () => {
    await renderComment({ totalReplies: 1 });

    expect(screen.getByText('1 reply')).toBeTruthy();
    expect(screen.getByTestId('comment-post-1-comment-1')).toBeTruthy();
  });

  it('renders relative ages from the pinned clock', async () => {
    await renderComment({
      postDate: new Date(FIXED_NOW.getTime() - 3 * 24 * 3600_000).toISOString(),
    });
    expect(screen.getByText('@commenter1 · 3 days ago')).toBeTruthy();
  });
});
