/**
 * E2E: the Videos tab beyond the feed itself — watch progress bars, opening a video, pull-to-refresh,
 * and the loading / error / empty states.
 */

import { FIXED_NOW, gamingCreator, makeVideo, techCreator, techMainChannel } from '@test/fixtures';

import { NETWORK_ERROR } from './helpers/mock-floatplane-api';
import { loadRuntime, type Runtime } from './helpers/runtime';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

const videosTab = () => rt.inTab('index');
const listedVideoIds = () => rt.listItemIds('videos-list');

async function openVideos() {
  rt.seedSession();
  await rt.renderApp();
  await rt.until(() => {
    expect(videosTab().getByText('Main Channel Video 01')).toBeTruthy();
  });
}

describe('watch progress', () => {
  it('fetches progress for the listed posts and draws a progress bar', async () => {
    // Video 02 runs 601s, so 300.5s watched is exactly half.
    rt.api.progress.set('ch-tech-main-02', 300.5);
    await openVideos();

    await rt.until(() => {
      expect(rt.screen.getByTestId('video-progress-ch-tech-main-02')).toBeTruthy();
    });
    expect(rt.styleOf(rt.screen.getByTestId('video-progress-ch-tech-main-02')).width).toBe('50%');
    expect(rt.screen.queryByTestId('video-progress-ch-tech-main-01')).toBeNull();

    const progressRequest = rt.defined(rt.api.requestsTo('/api/v3/content/progress')[0]);
    expect(progressRequest.params.get('ids[0]')).toBe('ch-tech-main-01');
    expect(progressRequest.params.get('contentType')).toBe('blogPost');
  });
});

describe('opening a video', () => {
  it('pushes the in-app video page instead of leaving the app', async () => {
    await openVideos();

    await rt.fireEvent.press(rt.screen.getByTestId('video-list-item-ch-tech-main-01'));

    await rt.until(() => {
      expect(rt.screen.getByTestId('video-player')).toBeTruthy();
    });
    expect(jest.spyOn(rt.linking, 'openURL')).not.toHaveBeenCalled();
  });
});

describe('refresh and states', () => {
  it('pull-to-refresh refetches the feed', async () => {
    await openVideos();
    rt.api.setChannelVideos(techCreator.id, techMainChannel.id, [
      makeVideo(techCreator, techMainChannel, {
        id: 'fresh',
        title: 'Brand New Upload',
        releaseDate: FIXED_NOW.toISOString(),
      }),
      ...rt.api.channelVideos(techMainChannel.id),
    ]);

    const [refreshControl] = rt.screen.container.queryAll(
      (node) => node.type === 'RCTRefreshControl',
    );
    await rt.fireEvent(rt.defined(refreshControl, 'the refresh control'), 'refresh');

    await rt.until(() => {
      expect(videosTab().getByText('Brand New Upload')).toBeTruthy();
    });
    expect(rt.screen.getByText('Main Channel · 10 likes · just now')).toBeTruthy();
  });

  it('shows a spinner while the session is still loading subscriptions', async () => {
    rt.api.latencyMs = 1000;
    rt.seedSession();
    await rt.renderApp();

    await rt.until(
      () => {
        expect(videosTab().getByTestId('videos-loading')).toBeTruthy();
      },
      {
        maxFakeMs: 500,
      },
    );
    await rt.until(
      () => {
        expect(videosTab().getByText('Main Channel Video 01')).toBeTruthy();
      },
      {
        maxFakeMs: 10_000,
      },
    );
    expect(videosTab().queryByTestId('videos-loading')).toBeNull();
  });

  it('shows a load error after react-query gives up retrying', async () => {
    // Each attempt fires one request per subscription, and the query retries twice.
    rt.api.failRequests(
      'GET /api/v3/content/creator',
      { status: 500, body: 'upstream exploded' },
      { count: 6 },
    );
    rt.seedSession();
    await rt.renderApp();

    await rt.until(
      () => {
        expect(
          videosTab().getByText(
            'Error loading videos: Failed to fetch videos: 500 - upstream exploded',
          ),
        ).toBeTruthy();
      },
      { maxFakeMs: 15_000 },
    );
  });

  it('keeps already-loaded videos when the next page fails', async () => {
    await openVideos();
    rt.api.failRequests('GET /api/v3/content/creator', NETWORK_ERROR, { count: 3 });

    await rt.reachListEnd('videos-list');
    await rt.advanceTime(15_000);
    expect(videosTab().getByText('Main Channel Video 01')).toBeTruthy();
    expect(listedVideoIds()).toHaveLength(33);
  });

  it('says when no subscription has posts', async () => {
    rt.api.videos.delete(techCreator.id);
    rt.api.videos.delete(gamingCreator.id);
    rt.seedSession();
    await rt.renderApp();

    await rt.until(() => {
      expect(videosTab().getByText('No videos found.')).toBeTruthy();
    });
  });
});
