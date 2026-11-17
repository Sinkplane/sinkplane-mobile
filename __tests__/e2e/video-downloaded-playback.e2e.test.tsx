/**
 * E2E: a downloaded post's video page plays the local file without asking Floatplane for a
 * stream (no on-demand delivery request), while comments, likes and watch progress still work;
 * a post that isn't downloaded still requests its delivery and plays the stream.
 */
import { downloadUri, makeDownloadedVideo } from '@test/fixtures-downloads';

import { loadRuntime, type Runtime } from './helpers/runtime';
import {
  emitTimeUpdate,
  GUID,
  openVideo,
  player,
  POST_ID,
  untilPlayable,
} from './helpers/video-page';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
  rt.notifications.mockNotifications.promptAnswer = 'denied';
});

const downloaded = (postId: string) =>
  makeDownloadedVideo({ postId, title: 'Main Channel Video 01', channel: 'Main Channel' });

describe('a downloaded post', () => {
  beforeEach(() => {
    rt.seedDownloads([downloaded(POST_ID)]);
  });

  it('plays the local file, fetching no stream', async () => {
    await openVideo(rt);
    await untilPlayable(rt);

    expect(rt.api.deliveryRequests('onDemand')).toEqual([]);
    expect(player(rt).source).toEqual({
      uri: downloadUri(POST_ID),
      metadata: {
        title: 'Main Channel Video 01',
        artist: 'Main Channel',
        artwork: downloadUri(POST_ID, 'jpg'),
      },
    });
    expect(player(rt).source).not.toHaveProperty('contentType');
    expect(player(rt).source).not.toHaveProperty('headers');
  });

  it('still loads the post and comments, takes likes, and resumes and saves progress', async () => {
    rt.api.progress.set(POST_ID, 42);
    await openVideo(rt);
    await untilPlayable(rt);

    expect(rt.api.requestsTo('/api/v3/comment')).not.toHaveLength(0);
    await rt.fireEvent.press(rt.screen.getByTestId('reaction-like'));
    await rt.until(() => {
      expect(rt.api.requestsTo('/api/v3/content/like')).toHaveLength(1);
    });

    await rt.act(() => {
      player(rt).setStatus('readyToPlay');
    });
    expect(player(rt).seeks).toContain(42);
    await emitTimeUpdate(rt, 57.6, 60);
    await rt.act(() => {
      player(rt).pause();
    });
    await rt.until(() => {
      expect(rt.api.progress.get(POST_ID)).toBe(57);
    });
    expect(rt.api.deliveryRequests('onDemand')).toEqual([]);
  });

  it("another post that isn't downloaded still requests its delivery and plays the stream", async () => {
    await openVideo(rt, 'ch-tech-main-02');
    await untilPlayable(rt, 'ch-tech-main-02');

    const requests = rt.api.deliveryRequests('onDemand');
    expect(requests).toHaveLength(1);
    expect(requests[0]?.params.get('entityId')).toBe('ch-tech-main-02-guid');
    expect(requests[0]?.params.get('entityId')).not.toBe(GUID);
    expect(player(rt).source).toMatchObject({
      contentType: 'hls',
      uri: expect.stringContaining('.m3u8') as string,
    });
  });
});

describe('when the post request fails', () => {
  async function openFailingPost(): Promise<void> {
    rt.seedSession();
    await rt.renderApp();
    await rt.until(() => {
      expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();
    });
    rt.api.failRequests(
      'GET /api/v3/content/post',
      { status: 500, body: { message: 'Oops' } },
      {
        count: 10,
      },
    );
    await rt.fireEvent.press(rt.screen.getByTestId(`video-list-item-${POST_ID}`));
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-screen')).toBeTruthy();
    });
  }

  it('a downloaded video still plays its download when the post cannot load', async () => {
    rt.seedDownloads([downloaded(POST_ID)]);
    await openFailingPost();
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-player')).toBeTruthy();
      expect(rt.screen.getByTestId('downloaded-video-details')).toBeTruthy();
    });

    expect(rt.screen.queryByText("Couldn't load this video.")).toBeNull();
    expect(player(rt).source).toMatchObject({ uri: downloadUri(POST_ID) });
  });

  it('without a download it says so and offers Retry', async () => {
    await openFailingPost();
    await rt.until(() => {
      expect(rt.screen.getByText("Couldn't load this video.")).toBeTruthy();
    });
    expect(rt.screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});

it('a post without a download requests its delivery', async () => {
  await openVideo(rt);
  await untilPlayable(rt);
  expect(rt.api.deliveryRequests('onDemand')).toHaveLength(1);
  expect(player(rt).source).toMatchObject({ contentType: 'hls' });
});
