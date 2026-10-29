/**
 * E2E: the Videos tab — the creator-wide feed, pagination, channel filter, sort, watch progress,
 * opening a video, refresh, and loading/error/empty states.
 */
import { StyleSheet } from 'react-native';

import { FIXED_NOW, gamingCreator, makeVideo, techCreator, techMainChannel } from '@test/fixtures';

import { NETWORK_ERROR } from './helpers/mock-floatplane-api';
import { loadRuntime, type Runtime } from './helpers/runtime';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

const videosTab = () => rt.inTab('index');
const contentRequests = () => rt.api.requestsTo('/api/v3/content/creator');
const lastContentRequest = () => contentRequests().at(-1)!;
const listedVideoIds = () => rt.listItemIds('videos-list');

async function openVideos() {
  rt.seedSession();
  await rt.renderApp();
  await rt.until(() => expect(videosTab().getByText('Main Channel Video 01')).toBeTruthy());
}

describe('creator feed', () => {
  it("shows the first creator's newest posts across all channels", async () => {
    await openVideos();

    expect(videosTab().getByText('Tech Channel')).toBeTruthy();
    // Channels interleave by release date: Main 01 (1 day ago) then Side 01 (1 day + 1h ago), …
    expect(listedVideoIds().slice(0, 4)).toEqual(['ch-tech-main-01', 'ch-tech-side-01', 'ch-tech-main-02', 'ch-tech-side-02']);
    expect(lastContentRequest().params.get('id')).toBe(techCreator.id);
    expect(lastContentRequest().params.has('channel')).toBe(false);
    expect(lastContentRequest().params.get('limit')).toBe('20');
    expect(lastContentRequest().params.get('sort')).toBe('DESC');
  });

  it('formats duration, likes and release age', async () => {
    await openVideos();

    const item = rt.screen.getByTestId('video-list-item-ch-tech-main-01');
    const scoped = rt.within(item);
    expect(scoped.getByText('1:02:05')).toBeTruthy();
    expect(scoped.getByText('Main Channel · 1.5K likes · 1 day ago')).toBeTruthy();
    expect(
      rt.within(rt.screen.getByTestId('video-list-item-ch-tech-side-02')).getByText('Side Channel · 1 likes · 2 days ago'),
    ).toBeTruthy();
  });

  it('loads the next page at the end of the list, and stops when there are no more', async () => {
    await openVideos();
    expect(videosTab().queryByText('Main Channel Video 11')).toBeNull();

    expect(listedVideoIds()).toHaveLength(20);

    await rt.reachListEnd('videos-list');
    await rt.until(() => expect(listedVideoIds()).toHaveLength(26));
    expect(lastContentRequest().params.get('fetchAfter')).toBe('20');
    expect(listedVideoIds().slice(-2)).toEqual(['ch-tech-main-13', 'ch-tech-side-13']);

    // The second page was short (6 < 20), so there is nothing left to fetch.
    const requestsBefore = contentRequests().length;
    await rt.reachListEnd('videos-list');
    await rt.advanceTime(1000);
    expect(contentRequests()).toHaveLength(requestsBefore);
  });

  it('filters by channel and back to all channels', async () => {
    await openVideos();

    await rt.fireEvent.press(videosTab().getByText('Side Channel'));
    await rt.until(() => expect(videosTab().queryByText('Main Channel Video 01')).toBeNull());
    expect(lastContentRequest().params.get('channel')).toBe('ch-tech-side');
    expect(listedVideoIds()).toHaveLength(13);
    expect(listedVideoIds().every(id => id.startsWith('ch-tech-side-'))).toBe(true);
    expect(videosTab().getByRole('button', { name: 'Side Channel' })).toBeSelected();

    await rt.fireEvent.press(videosTab().getByText('All'));
    await rt.until(() => expect(videosTab().getByText('Main Channel Video 01')).toBeTruthy());
    expect(videosTab().getByRole('button', { name: 'All' })).toBeSelected();
  });

  it('toggles between newest and oldest first', async () => {
    await openVideos();
    expect(videosTab().getByText('Newest')).toBeTruthy();

    await rt.fireEvent.press(videosTab().getByLabelText('Sorted by newest first. Tap to change.'));
    await rt.until(() => expect(listedVideoIds()[0]).toBe('ch-tech-side-13'));
    expect(videosTab().getByText('Oldest')).toBeTruthy();
    expect(lastContentRequest().params.get('sort')).toBe('ASC');

    await rt.fireEvent.press(videosTab().getByLabelText('Sorted by oldest first. Tap to change.'));
    await rt.until(() => expect(listedVideoIds()[0]).toBe('ch-tech-main-01'));
  });

  it('hides the channel filter for single-channel creators', async () => {
    rt.api.subscriptions = rt.api.subscriptions.filter(sub => sub.creator === gamingCreator.id);
    rt.seedSession();
    await rt.renderApp();

    await rt.until(() => expect(videosTab().getByText('Gaming Main Video 01')).toBeTruthy());
    expect(videosTab().getByText('Gaming Channel')).toBeTruthy();
    expect(videosTab().queryByText('All')).toBeNull();
  });
});

describe('watch progress', () => {
  it('fetches progress for the listed posts and draws a progress bar', async () => {
    // Video 02 runs 601s, so 300.5s watched is exactly half.
    rt.api.progress.set('ch-tech-main-02', 300.5);
    await openVideos();

    await rt.until(() => expect(rt.screen.getByTestId('video-progress-ch-tech-main-02')).toBeTruthy());
    expect(StyleSheet.flatten(rt.screen.getByTestId('video-progress-ch-tech-main-02').props.style).width).toBe('50%');
    expect(rt.screen.queryByTestId('video-progress-ch-tech-main-01')).toBeNull();

    const progressRequest = rt.api.requestsTo('/api/v3/content/progress').at(-1)!;
    expect(progressRequest.params.get('ids[0]')).toBe('ch-tech-main-01');
    expect(progressRequest.params.get('contentType')).toBe('blogPost');
  });
});

describe('opening a video', () => {
  it('opens the post on floatplane.com', async () => {
    await openVideos();

    await rt.fireEvent.press(rt.screen.getByTestId('video-list-item-ch-tech-main-01'));
    expect(rt.linking.openURL).toHaveBeenCalledWith('https://www.floatplane.com/post/ch-tech-main-01');
  });
});

describe('refresh and states', () => {
  it('pull-to-refresh refetches the feed', async () => {
    await openVideos();
    rt.api.setChannelVideos(techCreator.id, techMainChannel.id, [
      makeVideo(techCreator, techMainChannel, { id: 'fresh', title: 'Brand New Upload', releaseDate: FIXED_NOW.toISOString() }),
      ...rt.api.channelVideos(techMainChannel.id),
    ]);

    const [refreshControl] = rt.screen.container.queryAll(node => node.type === 'RCTRefreshControl');
    await rt.fireEvent(refreshControl, 'refresh');

    await rt.until(() => expect(videosTab().getByText('Brand New Upload')).toBeTruthy());
    expect(rt.screen.getByText('Main Channel · 10 likes · just now')).toBeTruthy();
  });

  it('shows a spinner while the session is still loading the creator', async () => {
    rt.api.latencyMs = 1000;
    rt.seedSession();
    await rt.renderApp();

    await rt.until(() => expect(videosTab().getByTestId('videos-loading')).toBeTruthy(), { maxFakeMs: 500 });
    await rt.until(() => expect(videosTab().getByText('Main Channel Video 01')).toBeTruthy(), { maxFakeMs: 10_000 });
    expect(videosTab().queryByTestId('videos-loading')).toBeNull();
  });

  it('shows a load error after react-query gives up retrying', async () => {
    rt.api.failRequests('GET', '/api/v3/content/creator', { status: 500, body: 'upstream exploded' }, 3);
    rt.seedSession();
    await rt.renderApp();

    await rt.until(
      () => expect(videosTab().getByText('Error loading videos: Failed to fetch videos: 500 - upstream exploded')).toBeTruthy(),
      { maxFakeMs: 15_000 },
    );
  });

  it('keeps already-loaded videos when the next page fails', async () => {
    await openVideos();
    rt.api.failRequests('GET', '/api/v3/content/creator', NETWORK_ERROR, 3);

    await rt.reachListEnd('videos-list');
    await rt.advanceTime(15_000);
    expect(videosTab().getByText('Main Channel Video 01')).toBeTruthy();
    expect(listedVideoIds()).toHaveLength(20);
  });

  it('says when a creator has no posts', async () => {
    rt.api.videos.delete(techCreator.id);
    rt.seedSession();
    await rt.renderApp();

    await rt.until(() => expect(videosTab().getByText('No videos found.')).toBeTruthy());
  });
});
