/**
 * E2E: the History tab — the signed-in user's watch history in API order with progress bars,
 * pagination, pull-to-refresh, refetch-on-focus (videos watched elsewhere show up), empty /
 * error / loading states, and opening a video from history.
 */
import type { Fiber } from 'react-reconciler';
import { StyleSheet } from 'react-native';

import { FIXED_NOW, gamingMainChannel, techMainChannel } from '@test/fixtures';

import { loadRuntime, type Runtime } from './helpers/runtime';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

const historyTab = () => rt.inTab('history');
const historyRequests = () => rt.api.requestsTo('/api/v3/content/history');
const listedIds = () => rt.listItemIds('history-list');
const widthOf = (element: { props: { style?: unknown } }) => StyleSheet.flatten(element.props.style as never).width;

/** updatedAt `hoursAgo` before the (pinned) clock, so seeding order controls the API order. */
const watchedAt = (hoursAgo: number) => new Date(FIXED_NOW.getTime() - hoursAgo * 60 * 60 * 1000).toISOString();

async function openHistoryTab() {
  rt.seedSession();
  const app = await rt.renderApp();
  await rt.until(() => expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy());
  await rt.selectTab('history');
  await rt.until(() => expect(app.getPathname()).toBe('/history'));
  return app;
}

/**
 * The history list's pull-to-refresh control — the Videos tab has one too, and non-focused tabs
 * stay mounted, so scope past it by walking up to this tab's screen host.
 */
const historyRefreshControl = () => {
  const [control] = rt.screen.container
    .queryAll(node => node.type === 'RCTRefreshControl')
    .filter(element => {
      let fiber: Fiber | null = element.unstable_fiber;
      while (fiber) {
        if (fiber.memoizedProps?.screenKey === 'history') return true;
        fiber = fiber.return;
      }
      return false;
    });
  if (!control) throw new Error('No pull-to-refresh control rendered inside the history tab');
  return control;
};

describe('the History tab', () => {
  it('shows the history in API order with each post’s saved progress', async () => {
    const videos = rt.api.channelVideos(techMainChannel.id);
    rt.api.seedHistoryEntry(videos[1], 300.5, watchedAt(24)); // 601s video, half watched
    rt.api.seedHistoryEntry(videos[4], 151, watchedAt(48)); // 604s video, a quarter watched
    await openHistoryTab();

    await rt.until(() => expect(listedIds()).toEqual(['ch-tech-main-02', 'ch-tech-main-05']));
    expect(historyTab().getByText('Watch History')).toBeTruthy();
    expect(widthOf(historyTab().getByTestId('video-progress-ch-tech-main-02'))).toBe('50%');
    expect(widthOf(historyTab().getByTestId('video-progress-ch-tech-main-05'))).toBe('25%');
    expect(historyRequests()[0]!.params.get('offset')).toBe('0');
    expect(historyRequests()[0]!.bearer).toBeTruthy();
  });

  it('says when there is no watch history yet', async () => {
    await openHistoryTab();

    await rt.until(() => expect(historyTab().getByText('No watch history found')).toBeTruthy());
    expect(historyTab().getByText('Watch some videos and they will show up here.')).toBeTruthy();
  });

  it('shows a load error after react-query gives up retrying', async () => {
    // The query retries twice: 3 attempts for the launch fetch plus 3 more for the focus refetch.
    rt.api.failRequests('GET', '/api/v3/content/history', { status: 500, body: 'upstream exploded' }, 6);
    const app = await openHistoryTab();

    await rt.until(
      () => expect(historyTab().getByText('Error loading history: Failed to fetch watch history: 500 - upstream exploded')).toBeTruthy(),
      { maxFakeMs: 15_000 },
    );
    expect(app.getPathname()).toBe('/history');
  });

  it('shows a spinner while the history is still loading', async () => {
    rt.api.latencyMs = 1000;
    const [video] = rt.api.channelVideos(techMainChannel.id);
    rt.api.seedHistoryEntry(video, 42, watchedAt(24));
    rt.seedSession();
    await rt.renderApp();

    await rt.until(() => expect(historyTab().getByTestId('history-loading')).toBeTruthy(), { maxFakeMs: 500 });
    await rt.until(() => expect(historyTab().getByText(video.title)).toBeTruthy(), { maxFakeMs: 10_000 });
    expect(historyTab().queryByTestId('history-loading')).toBeNull();
  });

  it('loads the next page at the end of the list and stops when history runs out', async () => {
    const all = [...rt.api.videos.values()].flatMap(byChannel => [...byChannel.values()].flat());
    all.slice(0, 25).forEach((video, index) => rt.api.seedHistoryEntry(video, 10, watchedAt(index)));
    await openHistoryTab();

    // Both tabs mount at launch, so selecting History refetches the first page before paging.
    await rt.until(() => expect(listedIds()).toHaveLength(20));
    await rt.until(() => expect(historyRequests().length).toBeGreaterThanOrEqual(2));
    expect(listedIds().slice(0, 2)).toEqual([all[0]!.id, all[1]!.id]); // API order, newest watch first

    await rt.reachListEnd('history-list');
    await rt.until(() => expect(listedIds()).toHaveLength(25));
    expect(historyRequests().filter(request => request.params.get('offset') === '20')).toHaveLength(1);

    // The short second page still promises one more: it comes back empty and ends paging.
    await rt.reachListEnd('history-list');
    await rt.until(() => expect(historyRequests().some(request => request.params.get('offset') === '25')).toBe(true));
    const requestsBefore = historyRequests().length;
    await rt.reachListEnd('history-list');
    await rt.advanceTime(1000);
    expect(historyRequests()).toHaveLength(requestsBefore);
    expect(listedIds()).toHaveLength(25);
  });

  it('opens the video page when an item is tapped', async () => {
    const [video] = rt.api.channelVideos(techMainChannel.id);
    rt.api.seedHistoryEntry(video, 42, watchedAt(24));
    const app = await openHistoryTab();

    await rt.fireEvent.press(historyTab().getByTestId(`video-list-item-${video.id}`));

    await rt.until(() => expect(app.getPathname()).toBe(`/video/${video.id}`));
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
    expect(rt.linking.openURL).not.toHaveBeenCalled();
  });

  it('refreshes the history on pull-to-refresh', async () => {
    const [techVideo] = rt.api.channelVideos(techMainChannel.id);
    rt.api.seedHistoryEntry(techVideo, 42, watchedAt(48));
    await openHistoryTab();

    const [gamingVideo] = rt.api.channelVideos(gamingMainChannel.id);
    rt.api.seedHistoryEntry(gamingVideo, 12, watchedAt(0));
    await rt.fireEvent(historyRefreshControl(), 'refresh');

    await rt.until(() => expect(listedIds()).toEqual([gamingVideo.id, techVideo.id]));
  });

  it('picks up history saved elsewhere when the tab regains focus', async () => {
    const [techVideo] = rt.api.channelVideos(techMainChannel.id);
    rt.api.seedHistoryEntry(techVideo, 42, watchedAt(48));
    await openHistoryTab();
    expect(listedIds()).toEqual([techVideo.id]);

    // A video gets watched (history saved) while the user is on another tab.
    await rt.selectTab('index');
    const [gamingVideo] = rt.api.channelVideos(gamingMainChannel.id);
    rt.api.seedHistoryEntry(gamingVideo, 12, watchedAt(0));

    const requestsBefore = historyRequests().length;
    await rt.selectTab('history');
    await rt.until(() => expect(listedIds()).toEqual([gamingVideo.id, techVideo.id]));
    expect(historyRequests().length).toBeGreaterThan(requestsBefore); // the tab refetched on focus
  });

  it('lands a just-watched video at the front of the history after saving progress', async () => {
    const POST_ID = 'ch-tech-main-01';
    await openHistoryTab();
    await rt.until(() => expect(historyTab().getByText('No watch history found')).toBeTruthy());

    // Watch a video from the Videos tab: play to 57.6s and pause → progress saved.
    await rt.selectTab('index');
    await rt.fireEvent.press(rt.inTab('index').getByTestId(`video-list-item-${POST_ID}`));
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
    const player = rt.mockVideoPlayerState.lastPlayer();
    await rt.act(async () => {
      player.setStatus('readyToPlay');
    });
    await rt.act(async () => {
      player.emit('timeUpdate', { currentTime: 57.6, bufferedPosition: 60, currentLiveTimestamp: null, currentOffsetFromLive: null });
    });
    await rt.act(async () => {
      player.pause();
    });
    await rt.until(() => expect(rt.api.requestsTo('/api/v3/content/progress', 'POST').length).toBeGreaterThan(0));
    expect(rt.api.history[0]!.video.id).toBe(POST_ID); // the backend moved the watch to the front

    // Leave the video and come back to the History tab → the watch is there, with its progress.
    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Close video' }));
    await rt.until(() => expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy());
    await rt.selectTab('history');

    await rt.until(() => expect(listedIds()).toContain(POST_ID));
    expect(historyTab().getByTestId(`video-progress-${POST_ID}`)).toBeTruthy();
  });
});
