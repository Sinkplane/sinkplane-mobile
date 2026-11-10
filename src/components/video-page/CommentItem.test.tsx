import { render, screen } from '@testing-library/react-native';

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

async function renderComment(
  overrides: Partial<Parameters<typeof CommentItem>[0]['comment']> = {},
) {
  await render(<CommentItem comment={{ ...comment, ...overrides }} />);
}

describe('CommentItem', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: FIXED_NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the author, age, text, likes and replies', async () => {
    await renderComment();

    expect(screen.getByTestId('comment-post-1-comment-1')).toBeTruthy();
    expect(screen.getByText('@commenter1 · 1 minute ago')).toBeTruthy();
    expect(screen.getByText('Comment number 1 on post-1')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy(); // likes
    expect(screen.getByText('2 replies')).toBeTruthy();
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
