/**
 * E2E: the video page — opening from the feed, the player, reactions, comments (pagination,
 * empty, error), post/delivery failures, watch progress, fullscreen, and back navigation.
 */
import { makeComments, makeVideoDelivery, makeVideoPost, techMainChannel } from '@test/fixtures';

import { loadRuntime, type Runtime } from './helpers/runtime';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

const POST_ID = 'ch-tech-main-01';
const GUID = `${POST_ID}-guid`;

/** Open the first Tech Main video from the feed (in-app navigation, like a real user). */
async function openVideo(id = POST_ID) {
  rt.seedSession();
  await rt.renderApp();
  await rt.until(() => expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy());
  await rt.fireEvent.press(rt.screen.getByTestId(`video-list-item-${id}`));
  await rt.until(() => expect(rt.screen.getByTestId('video-screen')).toBeTruthy());
}

/** Wait for the page to be playable: post + delivery fetched and the player mounted. */
async function untilPlayable(id = POST_ID) {
  await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
  await rt.until(() => expect(rt.screen.getByTestId('video-title')).toBeTruthy());
  expect(rt.api.requestsTo('/api/v3/content/post')[0]?.params.get('id')).toBe(id);
}

const player = () => rt.mockVideoPlayerState.lastPlayer();

describe('opening a video', () => {
  it('shows the title, player and comments after tapping a list item', async () => {
    await openVideo();

    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
    expect(rt.screen.getByTestId('video-title')).toHaveTextContent('Main Channel Video 01');

    // Default fixture comments render below the details.
    await rt.until(() => expect(rt.screen.getByTestId(`comment-${POST_ID}-comment-1`)).toBeTruthy());
    expect(rt.screen.getByText('Comments · 0')).toBeTruthy();

    // The player was pointed at the delivery's first origin / highest playable variant.
    expect(rt.mockVideoPlayerState.viewProps).not.toBeNull();
    expect(rt.api.requestsTo('/api/v3/delivery/info')[0]?.params.get('entityId')).toBe(GUID);
  });

  it('requests the post and delivery with the session token', async () => {
    await openVideo();
    await untilPlayable();

    const post = rt.api.requestsTo('/api/v3/content/post')[0];
    const delivery = rt.api.requestsTo('/api/v3/delivery/info')[0];
    expect(post.bearer).toBeTruthy();
    expect(delivery.bearer).toBe(post.bearer);
    expect(delivery.params.get('scenario')).toBe('onDemand');
    expect(delivery.params.get('entityId')).toBe(GUID);
  });
});

describe('reactions', () => {
  beforeEach(async () => {
    const video = rt.api.channelVideos(techMainChannel.id)[0];
    rt.api.posts.set(POST_ID, makeVideoPost(video, { likes: 10, dislikes: 2, comments: 3 }));
    await openVideo();
    await untilPlayable();
  });

  it('likes, unlikes, and switches to dislike — counts follow', async () => {
    expect(rt.screen.getByTestId('reaction-like-count')).toHaveTextContent('10');
    expect(rt.screen.getByTestId('reaction-dislike-count')).toHaveTextContent('2');

    await rt.fireEvent.press(rt.screen.getByTestId('reaction-like'));
    await rt.until(() => expect(rt.screen.getByTestId('reaction-like-count')).toHaveTextContent('11'));
    expect(rt.screen.getByRole('button', { name: 'Like, 11' })).toBeSelected();
    expect(rt.api.requestsTo('/api/v3/content/like')[0]?.body).toEqual({ id: POST_ID, contentType: 'blogPost' });

    // Like again → removed.
    await rt.fireEvent.press(rt.screen.getByTestId('reaction-like'));
    await rt.until(() => expect(rt.screen.getByTestId('reaction-like-count')).toHaveTextContent('10'));
    expect(rt.screen.getByRole('button', { name: 'Like, 10' })).not.toBeSelected();

    // Like → dislike switches both counters.
    await rt.fireEvent.press(rt.screen.getByTestId('reaction-like'));
    await rt.until(() => expect(rt.screen.getByTestId('reaction-like-count')).toHaveTextContent('11'));
    await rt.fireEvent.press(rt.screen.getByTestId('reaction-dislike'));
    await rt.until(() => expect(rt.screen.getByTestId('reaction-dislike-count')).toHaveTextContent('3'));
    expect(rt.screen.getByTestId('reaction-like-count')).toHaveTextContent('10');
    expect(rt.screen.getByRole('button', { name: 'Dislike, 3' })).toBeSelected();
  });

  it('persists the toggle server-side (like → dislike recorded on the post)', async () => {
    await rt.fireEvent.press(rt.screen.getByTestId('reaction-like'));
    await rt.until(() => expect(rt.screen.getByTestId('reaction-like-count')).toHaveTextContent('11'));

    await rt.fireEvent.press(rt.screen.getByTestId('reaction-dislike'));
    await rt.until(() => expect(rt.screen.getByTestId('reaction-dislike-count')).toHaveTextContent('3'));

    // The mock API now reports the dislike as the user's interaction for this post.
    expect(rt.api.interactions.get(POST_ID)).toBe('dislike');
    expect(rt.api.requestsTo('/api/v3/content/dislike')).toHaveLength(1);
  });

  it('explains when saving the reaction fails', async () => {
    rt.api.failRequests('POST', '/api/v3/content/like', { status: 500, body: 'nope' }, 1);

    await rt.fireEvent.press(rt.screen.getByTestId('reaction-like'));

    await rt.until(() => expect(rt.screen.getByText("Couldn't save your reaction. Try again.")).toBeTruthy());
    expect(rt.screen.getByTestId('reaction-like-count')).toHaveTextContent('10'); // unchanged
  });
});

describe('comments', () => {
  it('pages with fetchAfter at the end of the list', async () => {
    rt.api.comments.set(POST_ID, makeComments(POST_ID, 25));
    await openVideo();
    await untilPlayable();

    expect(rt.listItemIds('comment-list')).toHaveLength(20);
    const first = rt.api.requestsTo('/api/v3/comment')[0];
    expect(first?.params.get('blogPost')).toBe(POST_ID);
    expect(first?.params.get('limit')).toBe('20');
    expect(first?.params.has('fetchAfter')).toBe(false);

    await rt.reachListEnd('comment-list');
    await rt.until(() => expect(rt.listItemIds('comment-list')).toHaveLength(25));
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
    await openVideo();
    await untilPlayable();

    await rt.until(() => expect(rt.screen.getByText('No comments yet.')).toBeTruthy());
  });

  it('renders comment replies and their avatars', async () => {
    const [withReplies, oneReply] = makeComments(POST_ID, 2);
    rt.api.comments.set(POST_ID, [
      { ...withReplies, totalReplies: 1 },
      { ...oneReply, totalReplies: 1 },
    ]);
    await openVideo();
    await untilPlayable();

    await rt.until(() => expect(rt.screen.getByTestId(`comment-${POST_ID}-comment-1`)).toBeTruthy());
    expect(rt.screen.getAllByText('1 reply')).toHaveLength(2); // both comments have a single reply
  });

  it('shows an error with retry when comments fail to load', async () => {
    // The query retries twice, so the failure must outlast all three attempts.
    rt.api.failRequests('GET', '/api/v3/comment', { status: 500, body: 'comment blast' }, 3);
    await openVideo();
    await untilPlayable();

    await rt.until(() => expect(rt.screen.getByText("Couldn't load comments. Tap to retry.")).toBeTruthy());
    await rt.fireEvent.press(rt.screen.getByTestId('comments-retry'));
    await rt.until(() => expect(rt.screen.getByTestId(`comment-${POST_ID}-comment-1`)).toBeTruthy());
  });
});

describe('failure states', () => {
  it('shows a post error with retry', async () => {
    // The query retries twice: all three attempts fail before the error UI appears.
    rt.api.failRequests('GET', '/api/v3/content/post', { status: 500, body: 'post blast' }, 3);
    await openVideo();

    await rt.until(() => expect(rt.screen.getByText("Couldn't load this video.")).toBeTruthy());

    await rt.fireEvent.press(rt.screen.getByText('Retry'));
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
  });

  it('shows the picture for an image post instead of a player', async () => {
    const video = rt.api.channelVideos(techMainChannel.id)[0];
    const post = makeVideoPost(video, { videoAttachments: false });
    const picture = { id: 'pic-1', type: 'picture', thumbnail: { path: 'https://cdn.floatplane.test/pic-1.jpg' } };
    const text = `<p>Pumpkins &amp; candy&#8230;</p><p>${'We&#x27;re carving pumpkins. '.repeat(10)}</p>`;
    rt.api.posts.set(POST_ID, { ...post, text, pictureAttachments: [picture] } as unknown as typeof post);
    await openVideo();

    await rt.until(() => expect(rt.screen.getByTestId('post-image')).toBeTruthy());
    expect(rt.screen.queryByTestId('video-player')).toBeNull();
    expect(rt.screen.getByLabelText(post.title)).toHaveProp('source', [{ uri: 'https://cdn.floatplane.test/pic-1.jpg' }]);
    expect(rt.api.requestsTo('/api/v3/delivery/info')).toHaveLength(0);

    const description = rt.screen.getByTestId('post-description');
    expect(description).toHaveTextContent(/^Pumpkins & candy… We're carving pumpkins\./);
    expect(description).toHaveProp('numberOfLines', 3);
    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Show more' }));
    expect(rt.screen.getByTestId('post-description')).not.toHaveProp('numberOfLines');
  });

  it('falls back to the post thumbnail for a post without picture attachments', async () => {
    const video = rt.api.channelVideos(techMainChannel.id)[0];
    const post = makeVideoPost(video, { videoAttachments: false });
    rt.api.posts.set(POST_ID, post);
    await openVideo();

    await rt.until(() => expect(rt.screen.getByTestId('post-image')).toBeTruthy());
    expect(rt.screen.getByLabelText(post.title)).toHaveProp('source', [{ uri: post.thumbnail.path }]);
  });

  it('shows no media area for a text-only post', async () => {
    const video = rt.api.channelVideos(techMainChannel.id)[0];
    const post = makeVideoPost(video, { videoAttachments: false });
    rt.api.posts.set(POST_ID, { ...post, thumbnail: null } as unknown as typeof post);
    await openVideo();

    await rt.until(() => expect(rt.screen.getByTestId('video-title')).toBeTruthy());
    expect(rt.screen.queryByTestId('post-image')).toBeNull();
    expect(rt.screen.queryByTestId('player-placeholder')).toBeNull();
    expect(rt.screen.queryByTestId('video-player')).toBeNull();
  });

  it('falls back to the creator when the post has no channel', async () => {
    const video = rt.api.channelVideos(techMainChannel.id)[0];
    // Some posts embed no channel object; the details then show the creator instead.
    const post = makeVideoPost(video, { likes: 10, dislikes: 2 }) as unknown as ReturnType<typeof makeVideoPost>;
    rt.api.posts.set(POST_ID, { ...post, channel: undefined } as unknown as typeof post);
    await openVideo();
    await untilPlayable();

    await rt.until(() => expect(rt.screen.getByText('Tech Channel')).toBeTruthy());
    expect(rt.screen.queryByText('Main Channel')).toBeNull();
  });

  it('offers retry when the delivery request fails', async () => {
    rt.api.failRequests('GET', '/api/v3/delivery/info', { status: 503, body: 'cdn down' }, 3);
    await openVideo();

    await rt.until(() => expect(rt.screen.getByText("This video can't be played right now.")).toBeTruthy());

    await rt.fireEvent.press(rt.screen.getByText('Retry'));
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
  });

  it('offers retry when every stream variant is unavailable', async () => {
    rt.api.deliveries.set(GUID, makeVideoDelivery(GUID, { playable: false }));
    await openVideo();

    await rt.until(() => expect(rt.screen.getByText("This video can't be played right now.")).toBeTruthy());
    expect(rt.screen.queryByTestId('video-player')).toBeNull();
  });
});

describe('watch progress', () => {
  it('resumes at the saved position and saves on pause', async () => {
    rt.api.progress.set(POST_ID, 42);
    await openVideo();
    await untilPlayable();

    // The stream becomes playable: the player seeks to 42 and starts.
    await rt.act(async () => {
      player().setStatus('readyToPlay');
    });
    expect(player().play).toHaveBeenCalled();
    expect(player().seeks).toContain(42);

    // The user watches to 57.6s and pauses → progress saved (floored).
    await rt.act(async () => {
      player().emit('timeUpdate', { currentTime: 57.6, bufferedPosition: 60, currentLiveTimestamp: null, currentOffsetFromLive: null });
    });
    await rt.act(async () => {
      player().pause();
    });
    await rt.until(() => expect(rt.api.progress.get(POST_ID)).toBe(57));
    const saved = rt.api.requestsTo('/api/v3/content/progress').at(-1);
    expect(saved?.body).toEqual({ id: POST_ID, contentType: 'blogPost', progress: 57 });
  });

  it('re-issues a resume seek the stream dropped before it landed', async () => {
    rt.api.progress.set(POST_ID, 30);
    await openVideo();
    await untilPlayable();

    await rt.act(async () => {
      player().setStatus('readyToPlay'); // resume: seek 30 + play
    });
    await rt.act(async () => {
      player().emit('timeUpdate', { currentTime: 0, bufferedPosition: 0, currentLiveTimestamp: null, currentOffsetFromLive: null });
    });
    expect(player().seeks.filter(seconds => seconds === 30).length).toBe(2); // retried

    await rt.act(async () => {
      player().emit('timeUpdate', { currentTime: 29.5, bufferedPosition: 30, currentLiveTimestamp: null, currentOffsetFromLive: null });
    });
    // No watch-progress was posted while the resume was still settling (nor during the feed's GETs).
    expect(rt.api.requestsTo('/api/v3/content/progress', 'POST')).toHaveLength(0);
  });
});

describe('player interactions', () => {
  beforeEach(async () => {
    await openVideo();
    await untilPlayable();
    await rt.act(async () => {
      player().setStatus('readyToPlay'); // autoplay: resume → play
    });
  });

  it('pauses and resumes from the center button, and replays after the end', async () => {
    await rt.until(() => expect(rt.screen.getByRole('button', { name: 'Pause' })).toBeTruthy());

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Pause' }));
    await rt.until(() => expect(rt.screen.getByRole('button', { name: 'Play' })).toBeTruthy());
    expect(player().pause).toHaveBeenCalled();

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Play' }));
    await rt.until(() => expect(rt.screen.getByRole('button', { name: 'Pause' })).toBeTruthy());

    await rt.act(async () => {
      player().emit('playToEnd');
    });
    await rt.until(() => expect(rt.screen.getByRole('button', { name: 'Replay' })).toBeTruthy());
    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Replay' }));
    expect(player().replay).toHaveBeenCalled();
    await rt.until(() => expect(rt.screen.getByRole('button', { name: 'Pause' })).toBeTruthy());
  });

  it('skips ±15 seconds from the control buttons', async () => {
    player().currentTime = 100;
    player().duration = 600;

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Back 15 seconds' }));
    expect(player().seeks.at(-1)).toBe(85);
    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Forward 15 seconds' }));
    expect(player().seeks.at(-1)).toBe(100);
  });

  it('double-taps a side of the video to skip, showing the bubble', async () => {
    player().currentTime = 100;
    player().duration = 600;
    const surface = rt.screen.getByTestId('player-gesture-surface');
    await rt.fireEvent.layout(surface, { width: 300, height: 170 }); // left half is x < 150

    await rt.fireEvent.press(surface, { nativeEvent: { locationX: 60 } });
    await rt.fireEvent.press(surface, { nativeEvent: { locationX: 80 } });
    await rt.until(() => expect(rt.screen.getByTestId('seek-feedback-back')).toHaveTextContent('−15s'));
    expect(player().seeks.at(-1)).toBe(85);

    await rt.fireEvent.press(surface, { nativeEvent: { locationX: 240 } });
    await rt.fireEvent.press(surface, { nativeEvent: { locationX: 260 } });
    await rt.until(() => expect(rt.screen.getByTestId('seek-feedback-forward')).toHaveTextContent('+15s'));
    expect(player().seeks.at(-1)).toBe(100);

    await rt.advanceTime(700);
    expect(rt.screen.queryByTestId('seek-feedback-forward')).toBeNull();
  });

  it('plays at 2× while the video is pressed and held', async () => {
    const surface = rt.screen.getByTestId('player-gesture-surface');

    await rt.fireEvent(surface, 'longPress');
    await rt.until(() => expect(rt.screen.getByTestId('hold-speed-badge')).toBeTruthy());
    expect(player().playbackRate).toBe(2);

    await rt.fireEvent(surface, 'pressOut');
    await rt.until(() => expect(rt.screen.queryByTestId('hold-speed-badge')).toBeNull());
    expect(player().playbackRate).toBe(1);
  });

  it('changes and persists the playback speed from the menu', async () => {
    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Playback speed Normal' }));
    await rt.until(() => expect(rt.screen.getByTestId('speed-option-1.5')).toBeTruthy());

    await rt.fireEvent.press(rt.screen.getByTestId('speed-option-1.5'));
    await rt.until(() => expect(rt.screen.getByRole('button', { name: 'Playback speed 1.5×' })).toBeTruthy());
    expect(player().playbackRate).toBe(1.5);
    expect(rt.secureStore.get('playbackSpeed')).toBe('1.5');
  });

  it('scrubs the seek bar to a position', async () => {
    player().duration = 600;
    const bar = rt.screen.getByTestId('player-seek-bar');
    await rt.fireEvent.layout(bar, { width: 200, height: 28 });

    await rt.fireEvent(bar, 'responderGrant', { nativeEvent: { locationX: 100 } });
    await rt.fireEvent(bar, 'responderMove', { nativeEvent: { locationX: 150 } });
    await rt.until(() => expect(rt.screen.getByTestId('player-time')).toHaveTextContent('7:30 / 10:00')); // under the finger

    await rt.fireEvent(bar, 'responderRelease', { nativeEvent: { locationX: 150 } });
    expect(player().seeks.at(-1)).toBe(450); // 150 / 200 * 600s
  });

  it('drops the custom controls while in picture-in-picture', async () => {
    const view = () => rt.mockVideoPlayerState.viewProps!;
    await rt.act(async () => {
      view().onPictureInPictureStart?.();
    });
    await rt.until(() => expect(rt.screen.queryByTestId('player-controls')).toBeNull());

    await rt.act(async () => {
      view().onPictureInPictureStop?.();
    });
    await rt.until(() => expect(rt.screen.getByTestId('player-controls')).toBeTruthy());
  });
});

describe('fullscreen', () => {
  it('hides the comments, locks landscape, and comes back', async () => {
    await openVideo();
    await untilPlayable();
    await rt.until(() => expect(rt.screen.getByTestId(`comment-${POST_ID}-comment-1`)).toBeTruthy());

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Enter fullscreen' }));
    await rt.until(() => expect(rt.screen.queryByTestId('comment-list')).toBeNull());
    expect(rt.screen.getByTestId('video-player')).toBeTruthy();
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(rt.orientation.OrientationLock.LANDSCAPE);

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Exit fullscreen' }));
    await rt.until(() => expect(rt.screen.getByTestId('comment-list')).toBeTruthy());
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(rt.orientation.OrientationLock.PORTRAIT_UP);
  });

  it('follows the device rotation once the video is playable', async () => {
    const rotate = (orientation: number) =>
      rt.act(async () => {
        rt.orientation.emitOrientationChange(orientation);
      });
    await openVideo();
    await untilPlayable();
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(rt.orientation.OrientationLock.DEFAULT);

    await rotate(rt.orientation.Orientation.LANDSCAPE_LEFT);
    await rt.until(() => expect(rt.screen.queryByTestId('comment-list')).toBeNull());
    expect(rt.screen.getByRole('button', { name: 'Exit fullscreen' })).toBeTruthy();

    await rotate(rt.orientation.Orientation.PORTRAIT_UP);
    await rt.until(() => expect(rt.screen.getByTestId('comment-list')).toBeTruthy());
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(rt.orientation.OrientationLock.DEFAULT);
  });

  it('the back arrow leaves rotation-driven fullscreen and keeps the page in portrait', async () => {
    await openVideo();
    await untilPlayable();
    await rt.act(async () => {
      rt.orientation.emitOrientationChange(rt.orientation.Orientation.LANDSCAPE_LEFT);
    });
    await rt.until(() => expect(rt.screen.queryByTestId('comment-list')).toBeNull());

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Back' }));
    await rt.until(() => expect(rt.screen.getByTestId('comment-list')).toBeTruthy());
    expect(rt.screen.getByTestId('video-screen')).toBeTruthy();
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(rt.orientation.OrientationLock.PORTRAIT_UP);
  });

  it('keeps an image post in portrait', async () => {
    const video = rt.api.channelVideos(techMainChannel.id)[0];
    rt.api.posts.set(POST_ID, makeVideoPost(video, { videoAttachments: false }));
    await openVideo();
    await rt.until(() => expect(rt.screen.getByTestId('post-image')).toBeTruthy());

    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(rt.orientation.OrientationLock.PORTRAIT_UP);
    expect(rt.orientation.orientationListenerCount()).toBe(0);
  });

  it('the Android back button leaves fullscreen instead of the page', async () => {
    await openVideo();
    await untilPlayable();

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Enter fullscreen' }));
    await rt.until(() => expect(rt.screen.queryByTestId('comment-list')).toBeNull());
    expect(rt.backHandlers.length).toBeGreaterThan(0);

    let handled: boolean | null | undefined;
    await rt.act(async () => {
      handled = rt.backHandlers.at(-1)!();
    });
    expect(handled).toBe(true);
    await rt.until(() => expect(rt.screen.getByTestId('comment-list')).toBeTruthy());
  });
});

describe('playback errors', () => {
  const failStream = (message: string) =>
    rt.act(async () => {
      player().status = 'error';
      player().emit('statusChange', { status: 'error', error: { message } });
    });

  it('shows the error overlay and Retry reloads the stream and plays', async () => {
    await openVideo();
    await untilPlayable();

    await failStream('Network connection lost');
    await rt.until(() => expect(rt.screen.getByTestId('player-error')).toBeTruthy());
    expect(rt.screen.getByText('Network connection lost')).toBeTruthy();
    expect(rt.screen.queryByTestId('player-controls')).toBeNull();

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Retry' }));
    expect(player().replaceAsync).toHaveBeenCalledTimes(1);
    await rt.until(() => expect(player().play).toHaveBeenCalled());
  });

  it('drops out of fullscreen (comments return) when the stream fails there', async () => {
    await openVideo();
    await untilPlayable();
    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Enter fullscreen' }));
    await rt.until(() => expect(rt.screen.queryByTestId('comment-list')).toBeNull());

    await failStream('decoder failure');

    await rt.until(() => expect(rt.screen.getByTestId('comment-list')).toBeTruthy());
    expect(rt.screen.getByTestId('player-error')).toBeTruthy();
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(rt.orientation.OrientationLock.PORTRAIT_UP);
  });
});

describe('leaving the page', () => {
  it('navigates back to the list from the player controls', async () => {
    rt.seedSession();
    await rt.renderApp();
    await rt.until(() => expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy());
    await rt.fireEvent.press(rt.screen.getByTestId(`video-list-item-${POST_ID}`));
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Close video' }));

    await rt.until(() => expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy());
    expect(rt.screen.queryByTestId('video-screen')).toBeNull();
  });
});
