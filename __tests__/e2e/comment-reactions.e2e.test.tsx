/**
 * E2E: liking / disliking comments on the video page — the toggle request, counters, switching
 * and removing the reaction, a reaction the server already reports, and failures.
 */
import { makeComments } from '@test/fixtures';

import { loadRuntime, type Runtime } from './helpers/runtime';
import { defined, openVideo, POST_ID, untilPlayable } from './helpers/video-page';

const COMMENT_ID = `${POST_ID}-comment-1`;
const LIKE = `comment-${COMMENT_ID}-like`;
const DISLIKE = `comment-${COMMENT_ID}-dislike`;

let rt: Runtime;

/** Open the video page with the first comment at 4 likes / 0 dislikes. */
async function openWithComments(): Promise<void> {
  const [first, ...rest] = makeComments(POST_ID, 3);
  rt.api.comments.set(POST_ID, [{ ...defined(first, 'the first comment'), likes: 4 }, ...rest]);
  await openVideo(rt);
  await untilPlayable(rt);
  await rt.until(() => {
    expect(rt.screen.getByTestId(`${LIKE}-count`)).toBeTruthy();
  });
}

beforeEach(() => {
  rt = loadRuntime();
});

const likeCount = () => rt.screen.getByTestId(`${LIKE}-count`);
const dislikeCount = () => rt.screen.getByTestId(`${DISLIKE}-count`);

it('likes a comment: sends the toggle and bumps its counter', async () => {
  await openWithComments();
  expect(likeCount()).toHaveTextContent('4');
  await rt.fireEvent.press(rt.screen.getByTestId(LIKE));

  await rt.until(() => {
    expect(likeCount()).toHaveTextContent('5');
  });
  expect(rt.screen.getByRole('button', { name: 'Like comment, 5' })).toBeSelected();

  const request = defined(rt.api.requestsTo('/api/v3/comment/like', 'POST')[0], 'the like');
  expect(request.bearer).toBeTruthy();
  expect(request.body).toEqual({ comment: COMMENT_ID, blogPost: POST_ID });
  expect(rt.api.commentInteractions.get(COMMENT_ID)).toBe('like');

  // Only the pressed comment changed.
  expect(rt.screen.getByTestId(`comment-${POST_ID}-comment-2-like-count`)).toHaveTextContent('1');
});

it('pressing like again removes it; dislike switches the reaction', async () => {
  await openWithComments();
  await rt.fireEvent.press(rt.screen.getByTestId(LIKE));
  await rt.until(() => {
    expect(likeCount()).toHaveTextContent('5');
  });

  await rt.fireEvent.press(rt.screen.getByTestId(LIKE));
  await rt.until(() => {
    expect(likeCount()).toHaveTextContent('4');
  });
  expect(rt.api.commentInteractions.get(COMMENT_ID)).toBeNull();

  await rt.fireEvent.press(rt.screen.getByTestId(LIKE));
  await rt.until(() => {
    expect(likeCount()).toHaveTextContent('5');
  });
  await rt.fireEvent.press(rt.screen.getByTestId(DISLIKE));
  await rt.until(() => {
    expect(dislikeCount()).toHaveTextContent('1');
  });
  expect(likeCount()).toHaveTextContent('4');
  expect(rt.api.commentInteractions.get(COMMENT_ID)).toBe('dislike');
});

it('shows the reaction the server reports when the comments load', async () => {
  rt.api.commentInteractions.set(COMMENT_ID, 'dislike');
  await openWithComments();

  expect(likeCount()).toHaveTextContent('4');
  await rt.until(() => {
    expect(rt.screen.getByRole('button', { name: 'Dislike comment, 1' })).toBeSelected();
  });
});

it('explains when saving the reaction fails and keeps the counter', async () => {
  await openWithComments();
  rt.api.failRequests('POST /api/v3/comment/like', { status: 500, body: 'nope' }, { count: 1 });

  await rt.fireEvent.press(rt.screen.getByTestId(LIKE));

  await rt.until(() => {
    expect(rt.screen.getByText("Couldn't save your reaction. Try again.")).toBeTruthy();
  });
  expect(likeCount()).toHaveTextContent('4');
});
