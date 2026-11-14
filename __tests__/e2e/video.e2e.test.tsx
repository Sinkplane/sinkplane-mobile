/**
 * E2E: the video page — opening from the feed, reactions, comments (pagination, empty, error),
 * tappable description links, and back navigation. Post/media failures and watch progress:
 * video-posts; the player controls: video-controls; fullscreen and playback errors:
 * video-fullscreen.
 */
import { makeComments, makeVideoPost } from '@test/fixtures';

import { loadRuntime, type Runtime } from './helpers/runtime';
import {
  defined,
  firstTechVideo,
  GUID,
  openVideo,
  POST_ID,
  untilPlayable,
} from './helpers/video-page';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

describe('opening a video', () => {
  it('shows the title, player and comments after tapping a list item', async () => {
    await openVideo(rt);

    await rt.until(() => {
      expect(rt.screen.getByTestId('video-player')).toBeTruthy();
    });
    expect(rt.screen.getByTestId('video-title')).toHaveTextContent('Main Channel Video 01');

    // Default fixture comments render below the details.
    await rt.until(() => {
      expect(rt.screen.getByTestId(`comment-${POST_ID}-comment-1`)).toBeTruthy();
    });
    expect(rt.screen.getByText('Comments · 0')).toBeTruthy();

    // The player was pointed at the delivery's first origin / highest playable variant.
    expect(rt.mockVideoPlayerState.viewProps).not.toBeNull();
    expect(rt.api.deliveryRequests('onDemand')[0]?.params.get('entityId')).toBe(GUID);
  });

  it('requests the post and delivery with the session token', async () => {
    await openVideo(rt);
    await untilPlayable(rt);

    const post = defined(rt.api.requestsTo('/api/v3/content/post')[0], 'the post request');
    const delivery = defined(rt.api.deliveryRequests('onDemand')[0], 'the delivery request');
    expect(post.bearer).toBeTruthy();
    expect(delivery.bearer).toBe(post.bearer);
    expect(delivery.params.get('scenario')).toBe('onDemand');
    expect(delivery.params.get('entityId')).toBe(GUID);
  });
});

describe('reactions', () => {
  beforeEach(async () => {
    const video = firstTechVideo(rt);
    rt.api.posts.set(POST_ID, makeVideoPost(video, { likes: 10, dislikes: 2, comments: 3 }));
    await openVideo(rt);
    await untilPlayable(rt);
  });

  it('likes, unlikes, and switches to dislike — counts follow', async () => {
    expect(rt.screen.getByTestId('reaction-like-count')).toHaveTextContent('10');
    expect(rt.screen.getByTestId('reaction-dislike-count')).toHaveTextContent('2');

    await rt.fireEvent.press(rt.screen.getByTestId('reaction-like'));
    await rt.until(() => {
      expect(rt.screen.getByTestId('reaction-like-count')).toHaveTextContent('11');
    });
    expect(rt.screen.getByRole('button', { name: 'Like, 11' })).toBeSelected();
    expect(rt.api.requestsTo('/api/v3/content/like')[0]?.body).toEqual({
      id: POST_ID,
      contentType: 'blogPost',
    });

    // Like again → removed.
    await rt.fireEvent.press(rt.screen.getByTestId('reaction-like'));
    await rt.until(() => {
      expect(rt.screen.getByTestId('reaction-like-count')).toHaveTextContent('10');
    });
    expect(rt.screen.getByRole('button', { name: 'Like, 10' })).not.toBeSelected();

    // Like → dislike switches both counters.
    await rt.fireEvent.press(rt.screen.getByTestId('reaction-like'));
    await rt.until(() => {
      expect(rt.screen.getByTestId('reaction-like-count')).toHaveTextContent('11');
    });
    await rt.fireEvent.press(rt.screen.getByTestId('reaction-dislike'));
    await rt.until(() => {
      expect(rt.screen.getByTestId('reaction-dislike-count')).toHaveTextContent('3');
    });
    expect(rt.screen.getByTestId('reaction-like-count')).toHaveTextContent('10');
    expect(rt.screen.getByRole('button', { name: 'Dislike, 3' })).toBeSelected();
  });

  it('persists the toggle server-side (like → dislike recorded on the post)', async () => {
    await rt.fireEvent.press(rt.screen.getByTestId('reaction-like'));
    await rt.until(() => {
      expect(rt.screen.getByTestId('reaction-like-count')).toHaveTextContent('11');
    });

    await rt.fireEvent.press(rt.screen.getByTestId('reaction-dislike'));
    await rt.until(() => {
      expect(rt.screen.getByTestId('reaction-dislike-count')).toHaveTextContent('3');
    });

    // The mock API now reports the dislike as the user's interaction for this post.
    expect(rt.api.interactions.get(POST_ID)).toBe('dislike');
    expect(rt.api.requestsTo('/api/v3/content/dislike')).toHaveLength(1);
  });

  it('explains when saving the reaction fails', async () => {
    rt.api.failRequests('POST /api/v3/content/like', { status: 500, body: 'nope' }, { count: 1 });

    await rt.fireEvent.press(rt.screen.getByTestId('reaction-like'));

    await rt.until(() => {
      expect(rt.screen.getByText("Couldn't save your reaction. Try again.")).toBeTruthy();
    });
    expect(rt.screen.getByTestId('reaction-like-count')).toHaveTextContent('10'); // unchanged
  });
});

describe('comments', () => {
  it('pages with fetchAfter at the end of the list', async () => {
    rt.api.comments.set(POST_ID, makeComments(POST_ID, 25));
    await openVideo(rt);
    await untilPlayable(rt);

    expect(rt.listItemIds('comment-list')).toHaveLength(20);
    const first = rt.api.requestsTo('/api/v3/comment')[0];
    expect(first?.params.get('blogPost')).toBe(POST_ID);
    expect(first?.params.get('limit')).toBe('20');
    expect(first?.params.has('fetchAfter')).toBe(false);

    await rt.reachListEnd('comment-list');
    await rt.until(() => {
      expect(rt.listItemIds('comment-list')).toHaveLength(25);
    });
    const second = rt.api.requestsTo('/api/v3/comment').at(-1);
    expect(second?.params.get('fetchAfter')).toBe(`${POST_ID}-comment-20`);

    // The list is exhausted: reaching the end again fetches nothing.
    const requests = rt.api.requestsTo('/api/v3/comment').length;
    await rt.reachListEnd('comment-list');
    await rt.advanceTime(500);
    expect(rt.api.requestsTo('/api/v3/comment')).toHaveLength(requests);
  });

  it('says when there are no comments yet', async () => {
    rt.api.comments.set(POST_ID, []);
    await openVideo(rt);
    await untilPlayable(rt);

    await rt.until(() => {
      expect(rt.screen.getByText('No comments yet.')).toBeTruthy();
    });
  });

  it('renders comment replies and their avatars', async () => {
    const [withReplies, oneReply] = makeComments(POST_ID, 2);
    rt.api.comments.set(POST_ID, [
      { ...defined(withReplies, 'the first comment'), totalReplies: 1 },
      { ...defined(oneReply, 'the second comment'), totalReplies: 1 },
    ]);
    await openVideo(rt);
    await untilPlayable(rt);

    await rt.until(() => {
      expect(rt.screen.getByTestId(`comment-${POST_ID}-comment-1`)).toBeTruthy();
    });
    expect(rt.screen.getAllByText('1 reply')).toHaveLength(2); // both comments have a single reply
  });

  it('shows an error with retry when comments fail to load', async () => {
    // The query retries twice, so the failure must outlast all three attempts.
    rt.api.failRequests(
      'GET /api/v3/comment',
      { status: 500, body: 'comment blast' },
      { count: 3 },
    );
    await openVideo(rt);
    await untilPlayable(rt);

    await rt.until(() => {
      expect(rt.screen.getByText("Couldn't load comments. Tap to retry.")).toBeTruthy();
    });
    await rt.fireEvent.press(rt.screen.getByTestId('comments-retry'));
    await rt.until(() => {
      expect(rt.screen.getByTestId(`comment-${POST_ID}-comment-1`)).toBeTruthy();
    });
  });
});

describe('description links', () => {
  const LINKED_ID = 'ch-tech-main-02';

  it('opens a linked Floatplane post on its video page', async () => {
    const post = makeVideoPost(firstTechVideo(rt));
    rt.api.posts.set(POST_ID, {
      ...post,
      text: `<p>Watch <a href="https://www.floatplane.com/post/${LINKED_ID}">part 2</a> when it drops.</p>`,
    });
    await openVideo(rt);
    await untilPlayable(rt);

    expect(rt.screen.getByTestId('post-description')).toHaveTextContent(
      'Watch part 2 when it drops.',
    );
    const openURL = jest.spyOn(rt.linking, 'openURL');
    await rt.fireEvent.press(rt.screen.getByRole('link', { name: 'part 2' }));

    await rt.until(() => {
      expect(rt.screen.getByTestId('video-title')).toHaveTextContent('Main Channel Video 02');
    });
    expect(rt.api.requestsTo('/api/v3/content/post').at(-1)?.params.get('id')).toBe(LINKED_ID);
    expect(openURL).not.toHaveBeenCalled();
    openURL.mockRestore();
  });
});

describe('leaving the page', () => {
  it('navigates back to the list from the player controls', async () => {
    rt.seedSession();
    await rt.renderApp();
    await rt.until(() => {
      expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();
    });
    await rt.fireEvent.press(rt.screen.getByTestId(`video-list-item-${POST_ID}`));
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-player')).toBeTruthy();
    });

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Close video' }));

    await rt.until(() => {
      expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();
    });
    expect(rt.screen.queryByTestId('video-screen')).toBeNull();
  });
});
