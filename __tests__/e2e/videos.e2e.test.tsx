/**
 * E2E: the Videos tab — the merged all-subscriptions home feed, the subscription picker, search,
 * pagination, channel filter, sort, watch progress, opening a video, refresh, and
 * loading/error/empty states.
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

/** Pick a feed source ("All Subscriptions" or a creator) from the picker modal. */
async function pickSubscription(testID: 'subscription-option-all' | `subscription-option-${string}`) {
  await rt.fireEvent.press(videosTab().getByTestId('subscription-picker'));
  await rt.fireEvent.press(rt.screen.getByTestId(testID));
}

describe('the all-subscriptions home feed', () => {
  it('merges every subscription, newest posts across creators first (like floatplane.com)', async () => {
    await openVideos();

    expect(videosTab().getByText('All Subscriptions')).toBeTruthy();
    // Tech Main and Gaming Main share a release day, so the stable merge keeps Tech first.
    expect(listedVideoIds().slice(0, 6)).toEqual([
      'ch-tech-main-01',
      'ch-gaming-main-01',
      'ch-tech-side-01',
      'ch-tech-main-02',
      'ch-gaming-main-02',
      'ch-tech-side-02',
    ]);

    // One request per subscription, merged client-side.
    const requestedIds = contentRequests().map(request => request.params.get('id'));
    expect(requestedIds).toContain(techCreator.id);
    expect(requestedIds).toContain(gamingCreator.id);
    expect(contentRequests().every(request => request.params.get('limit') === '20')).toBe(true);
    expect(contentRequests().every(request => request.params.get('sort') === 'DESC')).toBe(true);
    expect(contentRequests().every(request => request.params.has('channel'))).toBe(false);
  });

  it('loads the next page per creator at the end of the list, and stops when all are exhausted', async () => {
    await openVideos();
    expect(videosTab().queryByText('Main Channel Video 11')).toBeNull();

    // Tech returns a full page (20); Gaming is done after its 13.
    expect(listedVideoIds()).toHaveLength(33);

    await rt.reachListEnd('videos-list');
    await rt.until(() => expect(listedVideoIds()).toHaveLength(39));
    const roundTwo = contentRequests().filter(request => request.params.get('fetchAfter') !== '0');
    expect(roundTwo).toHaveLength(1); // only Tech had more to give
    expect(roundTwo[0].params.get('id')).toBe(techCreator.id);
    expect(roundTwo[0].params.get('fetchAfter')).toBe('20');
    expect(listedVideoIds().slice(-3)).toEqual(['ch-gaming-main-13', 'ch-tech-main-13', 'ch-tech-side-13']);

    // Every creator's last page was short, so there is nothing left to fetch.
    const requestsBefore = contentRequests().length;
    await rt.reachListEnd('videos-list');
    await rt.advanceTime(1000);
    expect(contentRequests()).toHaveLength(requestsBefore);
  });

  it('toggles between newest and oldest first across all subscriptions', async () => {
    await openVideos();
    expect(videosTab().getByText('Newest')).toBeTruthy();

    await rt.fireEvent.press(videosTab().getByLabelText('Sorted by newest first. Tap to change.'));
    await rt.until(() => expect(listedVideoIds()[0]).toBe('ch-tech-side-13')); // oldest post overall
    expect(videosTab().getByText('Oldest')).toBeTruthy();
    expect(lastContentRequest().params.get('sort')).toBe('ASC');

    await rt.fireEvent.press(videosTab().getByLabelText('Sorted by oldest first. Tap to change.'));
    await rt.until(() => expect(listedVideoIds()[0]).toBe('ch-tech-main-01'));
  });
});

describe('subscription switching', () => {
  it('narrowes the feed to the picked creator', async () => {
    await openVideos();

    await pickSubscription(`subscription-option-${gamingCreator.id}`);

    await rt.until(() => expect(listedVideoIds()).toHaveLength(13));
    expect(videosTab().getByText('Gaming Main Video 01')).toBeTruthy();
    expect(videosTab().getByText('Gaming Channel')).toBeTruthy();
    expect(videosTab().queryByText('Main Channel Video 01')).toBeNull();

    const requestsAfterSwitch = contentRequests().filter(request => request.params.get('id') === gamingCreator.id);
    expect(requestsAfterSwitch.length).toBeGreaterThan(0);
    expect(listedVideoIds()).toHaveLength(13);
    expect(listedVideoIds().every(id => id.startsWith('ch-gaming-'))).toBe(true);
    // Single-channel creator → no channel chips.
    expect(videosTab().queryByText('All')).toBeNull();
  });

  it('marks the active creator in the picker and returns to the merged feed', async () => {
    await openVideos();
    await pickSubscription(`subscription-option-${techCreator.id}`);
    await rt.until(() => expect(listedVideoIds()).toHaveLength(20)); // first page of Tech's feed
    expect(listedVideoIds().every(id => id.startsWith('ch-tech-'))).toBe(true);

    await rt.fireEvent.press(videosTab().getByTestId('subscription-picker'));
    expect(rt.screen.getByRole('button', { name: 'Show Tech Channel' })).toBeSelected();
    expect(rt.screen.getByRole('button', { name: 'Show All Subscriptions' })).not.toBeSelected();

    await rt.fireEvent.press(rt.screen.getByTestId('subscription-option-all'));
    await rt.until(() => expect(listedVideoIds()).toHaveLength(33));
    expect(videosTab().getByText('All Subscriptions')).toBeTruthy();
  });

  it('dismisses the picker without changing the feed', async () => {
    await openVideos();

    await rt.fireEvent.press(videosTab().getByTestId('subscription-picker'));
    await rt.fireEvent.press(rt.screen.getByTestId('subscription-modal-backdrop'));

    await rt.until(() => expect(listedVideoIds()).toHaveLength(33));
    expect(videosTab().getByText('All Subscriptions')).toBeTruthy();
  });

  it('filters by one channel of the selected creator, and back to all channels', async () => {
    await openVideos();
    await pickSubscription(`subscription-option-${techCreator.id}`);
    await rt.until(() => expect(listedVideoIds()).toHaveLength(20)); // first page of Tech's feed

    await rt.fireEvent.press(videosTab().getByText('Side Channel'));
    await rt.until(() => expect(listedVideoIds()).toHaveLength(13));
    expect(videosTab().queryByText('Main Channel Video 01')).toBeNull();
    expect(lastContentRequest().params.get('id')).toBe(techCreator.id);
    expect(lastContentRequest().params.get('channel')).toBe('ch-tech-side');
    expect(listedVideoIds().every(id => id.startsWith('ch-tech-side-'))).toBe(true);
    expect(videosTab().getByRole('button', { name: 'Side Channel' })).toBeSelected();

    await rt.fireEvent.press(videosTab().getByText('All'));
    await rt.until(() => expect(listedVideoIds()).toHaveLength(20));
    expect(videosTab().getByRole('button', { name: 'All' })).toBeSelected();
  });
});

describe('search', () => {
  it('searches across the whole feed once typing settles', async () => {
    await openVideos();

    await rt.fireEvent.press(videosTab().getByTestId('video-search-toggle'));
    await rt.fireEvent.changeText(rt.screen.getByTestId('video-search-input'), 'Video 01');
    await rt.advanceTime(500);

    await rt.until(() => expect(listedVideoIds()).toHaveLength(3));
    expect(listedVideoIds()).toEqual(['ch-tech-main-01', 'ch-gaming-main-01', 'ch-tech-side-01']);
    const searchRequests = contentRequests().filter(request => request.params.get('search') === 'Video 01');
    expect(searchRequests.map(request => request.params.get('id')).sort()).toEqual(
      [gamingCreator.id, techCreator.id].sort(),
    );
  });

  it('narrows an already-narrowed creator feed', async () => {
    await openVideos();
    await pickSubscription(`subscription-option-${techCreator.id}`);
    await rt.until(() => expect(listedVideoIds()).toHaveLength(20)); // first page of Tech's feed

    await rt.fireEvent.press(videosTab().getByTestId('video-search-toggle'));
    await rt.fireEvent.changeText(rt.screen.getByTestId('video-search-input'), 'Side Channel Video 03');
    await rt.advanceTime(500);

    await rt.until(() => expect(listedVideoIds()).toEqual(['ch-tech-side-03']));
    expect(lastContentRequest().params.get('id')).toBe(techCreator.id);
  });

  it('reports when nothing matches', async () => {
    await openVideos();

    await rt.fireEvent.press(videosTab().getByTestId('video-search-toggle'));
    await rt.fireEvent.changeText(rt.screen.getByTestId('video-search-input'), 'Nonexistent');
    await rt.advanceTime(500);

    await rt.until(() => expect(videosTab().getByText('No videos found for “Nonexistent”.')).toBeTruthy());
  });

  it('clears the query and collapses the bar on cancel', async () => {
    await openVideos();

    await rt.fireEvent.press(videosTab().getByTestId('video-search-toggle'));
    await rt.fireEvent.changeText(rt.screen.getByTestId('video-search-input'), 'Video 01');

    await rt.fireEvent.press(videosTab().getByText('Cancel'));
    await rt.until(() => expect(listedVideoIds()).toHaveLength(33));
    expect(videosTab().queryByTestId('video-search-input')).toBeNull();
    expect(contentRequests().every(request => request.params.get('search') === '')).toBe(true);
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

    const progressRequest = rt.api.requestsTo('/api/v3/content/progress')[0]!;
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

  it('shows a spinner while the session is still loading subscriptions', async () => {
    rt.api.latencyMs = 1000;
    rt.seedSession();
    await rt.renderApp();

    await rt.until(() => expect(videosTab().getByTestId('videos-loading')).toBeTruthy(), { maxFakeMs: 500 });
    await rt.until(() => expect(videosTab().getByText('Main Channel Video 01')).toBeTruthy(), { maxFakeMs: 10_000 });
    expect(videosTab().queryByTestId('videos-loading')).toBeNull();
  });

  it('shows a load error after react-query gives up retrying', async () => {
    // Each attempt fires one request per subscription, and the query retries twice.
    rt.api.failRequests('GET', '/api/v3/content/creator', { status: 500, body: 'upstream exploded' }, 6);
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
    expect(listedVideoIds()).toHaveLength(33);
  });

  it('says when no subscription has posts', async () => {
    rt.api.videos.delete(techCreator.id);
    rt.api.videos.delete(gamingCreator.id);
    rt.seedSession();
    await rt.renderApp();

    await rt.until(() => expect(videosTab().getByText('No videos found.')).toBeTruthy());
  });
});
