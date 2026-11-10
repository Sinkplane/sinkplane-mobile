/**
 * E2E: the video page — post and stream failures, image/text posts, and watch progress.
 */
import { makeVideoDelivery, makeVideoPost } from '@test/fixtures';

import { loadRuntime, type Runtime } from './helpers/runtime';
import {
  firstTechVideo,
  GUID,
  openVideo,
  player,
  POST_ID,
  untilPlayable,
} from './helpers/video-page';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

describe('failure states', () => {
  it('shows a post error with retry', async () => {
    // The query retries twice: all three attempts fail before the error UI appears.
    rt.api.failRequests(
      'GET /api/v3/content/post',
      { status: 500, body: 'post blast' },
      { count: 3 },
    );
    await openVideo(rt);

    await rt.until(() => {
      expect(rt.screen.getByText("Couldn't load this video.")).toBeTruthy();
    });

    await rt.fireEvent.press(rt.screen.getByText('Retry'));
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-player')).toBeTruthy();
    });
  });

  it('shows the picture for an image post instead of a player', async () => {
    const video = firstTechVideo(rt);
    const post = makeVideoPost(video, { videoAttachments: false });
    const picture = {
      id: 'pic-1',
      type: 'picture',
      thumbnail: { path: 'https://cdn.floatplane.test/pic-1.jpg' },
    };
    const text = `<p>Pumpkins &amp; candy&#8230;</p><p>${'We&#x27;re carving pumpkins. '.repeat(10)}</p>`;
    rt.api.posts.set(POST_ID, {
      ...post,
      text,
      pictureAttachments: [picture],
    } as unknown as typeof post);
    await openVideo(rt);

    await rt.until(() => {
      expect(rt.screen.getByTestId('post-image')).toBeTruthy();
    });
    expect(rt.screen.queryByTestId('video-player')).toBeNull();
    expect(rt.screen.getByLabelText(post.title)).toHaveProp('source', [
      { uri: 'https://cdn.floatplane.test/pic-1.jpg' },
    ]);
    expect(rt.api.deliveryRequests('onDemand')).toHaveLength(0);

    const description = rt.screen.getByTestId('post-description');
    expect(description).toHaveTextContent(/^Pumpkins & candy… We're carving pumpkins\./);
    expect(description).toHaveProp('numberOfLines', 3);
    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Show more' }));
    expect(rt.screen.getByTestId('post-description')).not.toHaveProp('numberOfLines');
  });

  it('falls back to the post thumbnail for a post without picture attachments', async () => {
    const video = firstTechVideo(rt);
    const post = makeVideoPost(video, { videoAttachments: false });
    rt.api.posts.set(POST_ID, post);
    await openVideo(rt);

    await rt.until(() => {
      expect(rt.screen.getByTestId('post-image')).toBeTruthy();
    });
    expect(rt.screen.getByLabelText(post.title)).toHaveProp('source', [
      { uri: post.thumbnail.path },
    ]);
  });

  it('shows no media area for a text-only post', async () => {
    const video = firstTechVideo(rt);
    const post = makeVideoPost(video, { videoAttachments: false });
    rt.api.posts.set(POST_ID, { ...post, thumbnail: null } as unknown as typeof post);
    await openVideo(rt);

    await rt.until(() => {
      expect(rt.screen.getByTestId('video-title')).toBeTruthy();
    });
    expect(rt.screen.queryByTestId('post-image')).toBeNull();
    expect(rt.screen.queryByTestId('player-placeholder')).toBeNull();
    expect(rt.screen.queryByTestId('video-player')).toBeNull();
  });

  it('falls back to the creator when the post has no channel', async () => {
    const video = firstTechVideo(rt);
    // Some posts embed no channel object; the details then show the creator instead.
    const post = makeVideoPost(video, { likes: 10, dislikes: 2 });
    rt.api.posts.set(POST_ID, { ...post, channel: undefined } as unknown as typeof post);
    await openVideo(rt);
    await untilPlayable(rt);

    await rt.until(() => {
      expect(rt.screen.getByText('Tech Channel')).toBeTruthy();
    });
    expect(rt.screen.queryByText('Main Channel')).toBeNull();
  });

  it('offers retry when the delivery request fails', async () => {
    const onDemand = (req: { params: URLSearchParams }) =>
      req.params.get('scenario') === 'onDemand';
    rt.api.failRequests(
      'GET /api/v3/delivery/info',
      { status: 503, body: 'cdn down' },
      { count: 3, where: onDemand },
    );
    await openVideo(rt);

    await rt.until(() => {
      expect(rt.screen.getByText("This video can't be played right now.")).toBeTruthy();
    });

    await rt.fireEvent.press(rt.screen.getByText('Retry'));
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-player')).toBeTruthy();
    });
  });

  it('offers retry when every stream variant is unavailable', async () => {
    rt.api.deliveries.set(GUID, makeVideoDelivery(GUID, { playable: false }));
    await openVideo(rt);

    await rt.until(() => {
      expect(rt.screen.getByText("This video can't be played right now.")).toBeTruthy();
    });
    expect(rt.screen.queryByTestId('video-player')).toBeNull();
  });
});

describe('watch progress', () => {
  it('resumes at the saved position and saves on pause', async () => {
    rt.api.progress.set(POST_ID, 42);
    await openVideo(rt);
    await untilPlayable(rt);

    // The stream becomes playable: the player seeks to 42 and starts.
    await rt.act(() => {
      player(rt).setStatus('readyToPlay');
    });
    expect(player(rt).play).toHaveBeenCalled();
    expect(player(rt).seeks).toContain(42);

    // The user watches to 57.6s and pauses → progress saved (floored).
    await rt.act(() => {
      player(rt).emit('timeUpdate', {
        currentTime: 57.6,
        bufferedPosition: 60,
        currentLiveTimestamp: null,
        currentOffsetFromLive: null,
      });
    });
    await rt.act(() => {
      player(rt).pause();
    });
    await rt.until(() => {
      expect(rt.api.progress.get(POST_ID)).toBe(57);
    });
    const saved = rt.api.requestsTo('/api/v3/content/progress').at(-1);
    expect(saved?.body).toEqual({ id: POST_ID, contentType: 'blogPost', progress: 57 });
  });

  it('re-issues a resume seek the stream dropped before it landed', async () => {
    rt.api.progress.set(POST_ID, 30);
    await openVideo(rt);
    await untilPlayable(rt);

    await rt.act(() => {
      player(rt).setStatus('readyToPlay'); // resume: seek 30 + play
    });
    await rt.act(() => {
      player(rt).emit('timeUpdate', {
        currentTime: 0,
        bufferedPosition: 0,
        currentLiveTimestamp: null,
        currentOffsetFromLive: null,
      });
    });
    expect(player(rt).seeks.filter((seconds) => seconds === 30)).toHaveLength(2); // retried

    await rt.act(() => {
      player(rt).emit('timeUpdate', {
        currentTime: 29.5,
        bufferedPosition: 30,
        currentLiveTimestamp: null,
        currentOffsetFromLive: null,
      });
    });
    // No watch-progress was posted while the resume was still settling (nor during the feed's GETs).
    expect(rt.api.requestsTo('/api/v3/content/progress', 'POST')).toHaveLength(0);
  });
});
