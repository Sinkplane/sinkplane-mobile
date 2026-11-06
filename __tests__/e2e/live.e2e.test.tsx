/**
 * E2E: live streams (TV app parity) — the Live tab's per-creator stream status, the tab bar badge
 * kept current by polling, the live player page (live controls, stream ending / coming back,
 * auto-reload after playback errors, "not found" playlists treated as offline), status-check
 * failures, and fullscreen.
 */
import { gamingCreator, LIVESTREAM_ID, techCreator } from '@test/fixtures';

import { loadRuntime, type Runtime } from './helpers/runtime';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

const POLL_MS = 60_000;
const LIVE_PATH = `/live/${techCreator.id}` as const;

const liveTab = () => rt.inTab('live');
const liveChecks = () => rt.api.deliveryRequests('live');
const techCard = () => liveTab().getByTestId(`live-stream-${techCreator.id}`);
const player = () => rt.mockVideoPlayerState.lastPlayer();

async function launch() {
  rt.seedSession();
  const app = await rt.renderApp();
  await rt.until(() => expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy());
  return app;
}

async function openLiveTab() {
  const app = await launch();
  await rt.selectTab('live');
  await rt.until(() => expect(app.getPathname()).toBe('/live'));
  return app;
}

/** Live tab → tap the (live) Tech card → the live player page. */
async function openLivePlayer() {
  rt.api.liveNow.add(LIVESTREAM_ID);
  const app = await openLiveTab();
  await rt.until(() => expect(liveTab().getByTestId('live-status-live')).toBeTruthy());
  await rt.fireEvent.press(techCard());
  await rt.until(() => expect(app.getPathname()).toBe(LIVE_PATH));
  await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
  return app;
}

/** The native player reports a failure (optionally with its error message). */
async function failPlayback(message?: string) {
  await rt.act(async () => {
    player().status = 'error';
    player().emit('statusChange', { status: 'error', error: message ? { message } : undefined });
  });
}

describe('the Live tab', () => {
  it('shows each streaming creator’s offline card, and no badge, while nobody is live', async () => {
    await openLiveTab();

    await rt.until(() => expect(liveTab().getByTestId('live-status-offline')).toBeTruthy());
    expect(liveTab().getByText('Live')).toBeTruthy();
    expect(liveTab().getByText('We are offline')).toBeTruthy();
    expect(liveTab().getByText('Back Friday at 4pm')).toBeTruthy();
    // Gaming Channel has no livestream, so it isn't listed.
    expect(rt.listItemIds('live-list')).toEqual([techCreator.id]);
    expect(liveTab().queryByText(gamingCreator.title)).toBeNull();
    expect(rt.tabBadge('live')).toBeUndefined();

    // Offline streams can't be opened.
    await rt.fireEvent.press(techCard());
    expect(rt.screen.queryByTestId('live-screen')).toBeNull();
  });

  it('checks the livestream with the live delivery scenario and the session token', async () => {
    const token = rt.seedSession();
    await rt.renderApp();

    await rt.until(() => expect(liveChecks().length).toBeGreaterThan(0));
    const [check] = liveChecks();
    expect(check.params.get('entityId')).toBe(LIVESTREAM_ID);
    expect(check.params.get('entityKind')).toBe('livestream');
    expect(check.bearer).toBe(token);
    // Only creators with a livestream are checked.
    expect(new Set(liveChecks().map(request => request.params.get('entityId')))).toEqual(new Set([LIVESTREAM_ID]));
  });

  it('badges the tab and lists the stream as live when a creator is broadcasting', async () => {
    rt.api.liveNow.add(LIVESTREAM_ID);
    await openLiveTab();

    await rt.until(() => expect(liveTab().getByTestId('live-status-live')).toBeTruthy());
    expect(rt.tabBadge('live')).toBe('LIVE');
    expect(liveTab().getByText('Tech Live: Friday Show')).toBeTruthy();
    expect(liveTab().getByRole('button', { name: 'Watch Tech Channel live: Tech Live: Friday Show' })).toBeTruthy();
  });

  it('polls every minute, so the badge appears when a stream starts and clears when it ends', async () => {
    await launch();
    await rt.until(() => expect(liveChecks().length).toBeGreaterThan(0));
    expect(rt.tabBadge('live')).toBeUndefined();

    rt.api.liveNow.add(LIVESTREAM_ID);
    const checksBefore = liveChecks().length;
    await rt.advanceTime(POLL_MS);
    await rt.until(() => expect(rt.tabBadge('live')).toBe('LIVE'));
    expect(liveChecks().length).toBeGreaterThan(checksBefore);

    rt.api.liveNow.delete(LIVESTREAM_ID);
    await rt.advanceTime(POLL_MS);
    await rt.until(() => expect(rt.tabBadge('live')).toBeUndefined());
  });

  it('re-checks the status when the tab is shown again', async () => {
    await openLiveTab();
    await rt.until(() => expect(liveTab().getByTestId('live-status-offline')).toBeTruthy());

    await rt.selectTab('index');
    rt.api.liveNow.add(LIVESTREAM_ID);
    await rt.selectTab('live');

    await rt.until(() => expect(liveTab().getByTestId('live-status-live')).toBeTruthy());
  });

  it('re-checks the status on pull-to-refresh', async () => {
    await openLiveTab();
    await rt.until(() => expect(liveTab().getByTestId('live-status-offline')).toBeTruthy());

    // Background polls don't show the pull-to-refresh spinner.
    const refreshControl = () => rt.screen.getByTestId('live-list').props.refreshControl.props;
    const checksBefore = liveChecks().length;
    rt.api.latencyMs = 10_000;
    await rt.advanceTime(POLL_MS);
    expect(liveChecks().length).toBeGreaterThan(checksBefore);
    expect(refreshControl().refreshing).toBe(false);
    await rt.advanceTime(10_000);

    rt.api.liveNow.add(LIVESTREAM_ID);
    rt.api.latencyMs = 500;
    await rt.act(async () => {
      refreshControl().onRefresh();
    });
    expect(refreshControl().refreshing).toBe(true);

    await rt.until(() => expect(liveTab().getByTestId('live-status-live')).toBeTruthy());
    expect(refreshControl().refreshing).toBe(false);
  });

  it('says when the status check fails', async () => {
    // The launch check and react-query's two retries.
    rt.api.failRequests('GET', '/api/v3/delivery/info', { status: 503, body: 'down' }, 3);
    await openLiveTab();

    await rt.until(() => expect(liveTab().getByTestId('live-status-error')).toBeTruthy(), { maxFakeMs: 15_000 });
    expect(liveTab().getByText("Couldn't check the stream status. Pull to retry.")).toBeTruthy();
  });

  it('says so when no subscribed creator has a livestream', async () => {
    rt.api.creators = [{ ...techCreator, liveStream: undefined }, gamingCreator];
    await openLiveTab();

    await rt.until(() => expect(liveTab().getByText('No live streams')).toBeTruthy());
    expect(liveTab().getByText('None of your creators stream live on Floatplane.')).toBeTruthy();
    expect(liveChecks()).toHaveLength(0);
  });
});

describe('the live player page', () => {
  it('plays the adaptive live playlist with live controls and the stream details', async () => {
    const token = rt.seedSession();
    rt.api.liveNow.add(LIVESTREAM_ID);
    const app = await rt.renderApp();
    await rt.until(() => expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy());
    await rt.selectTab('live');
    await rt.until(() => expect(liveTab().getByTestId('live-status-live')).toBeTruthy());
    await rt.fireEvent.press(techCard());
    await rt.until(() => expect(app.getPathname()).toBe(LIVE_PATH));
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());

    expect(player().source).toEqual(
      expect.objectContaining({
        uri: `https://live.floatplane.test/${LIVESTREAM_ID}/live-abr.m3u8?token=signed`,
        contentType: 'hls',
        headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
        metadata: expect.objectContaining({ title: 'Tech Live: Friday Show', artist: 'Tech Channel' }),
      }),
    );
    expect(rt.screen.getByTestId('live-title')).toHaveTextContent('Tech Live: Friday Show');
    expect(rt.screen.getByTestId('live-description')).toHaveTextContent('Live tech talk & news');

    // Autoplays once ready; the controls have no seeking or speed, only a LIVE badge.
    await rt.act(async () => player().setStatus('readyToPlay'));
    expect(player().play).toHaveBeenCalled();
    await rt.act(async () => player().pause());
    expect(rt.screen.getByTestId('player-live-badge')).toBeTruthy();
    expect(rt.screen.queryByTestId('player-time')).toBeNull();
    expect(rt.screen.queryByTestId('player-seek-bar')).toBeNull();
    expect(rt.screen.queryByRole('button', { name: /seconds$/ })).toBeNull();
    expect(rt.screen.queryByRole('button', { name: /^Playback speed/ })).toBeNull();
    // No watch progress for live streams.
    expect(rt.api.requestsTo('/api/v3/content/progress', 'POST')).toHaveLength(0);
  });

  it('shows the not-live notice when the stream ends, and plays again once it is back', async () => {
    await openLivePlayer();

    rt.api.liveNow.delete(LIVESTREAM_ID);
    await rt.advanceTime(POLL_MS);
    await rt.until(() => expect(rt.screen.getByText('Tech Channel is not live right now.')).toBeTruthy());
    expect(rt.screen.queryByTestId('video-player')).toBeNull();
    expect(rt.screen.getByTestId('live-title')).toHaveTextContent('We are offline');

    rt.api.liveNow.add(LIVESTREAM_ID);
    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Check again' }));
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
  });

  it('leaves fullscreen when the stream ends there', async () => {
    await openLivePlayer();
    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Enter fullscreen' }));
    expect(rt.screen.queryByTestId('live-title')).toBeNull();

    rt.api.liveNow.delete(LIVESTREAM_ID);
    await rt.advanceTime(POLL_MS);

    await rt.until(() => expect(rt.screen.getByText('Tech Channel is not live right now.')).toBeTruthy());
    expect(rt.screen.getByTestId('live-title')).toHaveTextContent('We are offline');
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(rt.orientation.OrientationLock.PORTRAIT_UP);
  });

  it('reloads the stream with a fresh delivery 5 seconds after a playback error', async () => {
    await openLivePlayer();
    const playersBefore = rt.mockVideoPlayerState.players.length;
    const checksBefore = liveChecks().length;

    await failPlayback('The network connection was lost.');
    expect(rt.screen.getByTestId('player-error')).toBeTruthy();
    await rt.advanceTime(4000);
    expect(rt.mockVideoPlayerState.players).toHaveLength(playersBefore);

    await rt.advanceTime(1000);
    await rt.until(() => expect(rt.mockVideoPlayerState.players.length).toBe(playersBefore + 1));
    expect(liveChecks().length).toBeGreaterThan(checksBefore);
    expect(rt.screen.queryByTestId('player-error')).toBeNull();
  });

  it('cancels a pending retry when a status check takes the stream offline', async () => {
    rt.api.liveNow.add(LIVESTREAM_ID);
    await openLiveTab();
    await rt.until(() => expect(liveTab().getByTestId('live-status-live')).toBeTruthy());
    const refresh = rt.screen.getByTestId('live-list').props.refreshControl.props.onRefresh;
    await rt.fireEvent.press(techCard());
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
    await failPlayback('The network connection was lost.');
    rt.api.liveNow.delete(LIVESTREAM_ID);
    await rt.act(async () => refresh());
    await rt.until(() => expect(rt.screen.getByText('Tech Channel is not live right now.')).toBeTruthy());

    rt.api.liveNow.add(LIVESTREAM_ID);
    await rt.act(async () => refresh());
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
    const recovered = player();
    await rt.advanceTime(6000);
    expect(player()).toBe(recovered);
  });

  it('reloads right away from the error overlay’s Retry', async () => {
    await openLivePlayer();
    const playersBefore = rt.mockVideoPlayerState.players.length;

    await failPlayback();
    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Retry' }));

    await rt.until(() => expect(rt.mockVideoPlayerState.players.length).toBe(playersBefore + 1));
    // The pending automatic reload was cancelled.
    await rt.advanceTime(6000);
    expect(rt.mockVideoPlayerState.players).toHaveLength(playersBefore + 1);
  });

  it('treats a missing live playlist as offline until the next status check', async () => {
    await openLivePlayer();

    await failPlayback('HTTP 404: File Not Found');
    await rt.until(() => expect(rt.screen.getByText('Tech Channel is not live right now.')).toBeTruthy());
    expect(rt.screen.queryByTestId('video-player')).toBeNull();
    await rt.advanceTime(6000); // no automatic reload for a missing stream
    expect(rt.screen.queryByTestId('video-player')).toBeNull();

    // The next poll still reports the stream live, so the player tries again.
    await rt.advanceTime(POLL_MS);
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
  });

  it('offers a retry when the status check fails', async () => {
    rt.api.liveNow.add(LIVESTREAM_ID);
    rt.api.failRequests('GET', '/api/v3/delivery/info', { status: 503, body: 'down' }, 3);
    const app = await launch();
    await rt.act(async () => rt.router.push(LIVE_PATH));
    await rt.until(() => expect(app.getPathname()).toBe(LIVE_PATH));

    await rt.until(() => expect(rt.screen.getByText("Couldn't check the stream status.")).toBeTruthy(), { maxFakeMs: 15_000 });
    expect(app.getPathname()).toBe(LIVE_PATH);

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Retry' }));
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
  });

  it('says so for a creator without a livestream', async () => {
    const app = await launch();
    await rt.act(async () => rt.router.push(`/live/${gamingCreator.id}`));
    await rt.until(() => expect(app.getPathname()).toBe(`/live/${gamingCreator.id}`));

    await rt.until(() => expect(rt.screen.getByText("This creator doesn't stream live on Floatplane.")).toBeTruthy());
  });

  it('goes fullscreen and back, and closes back to the Live tab', async () => {
    const app = await openLivePlayer();

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Enter fullscreen' }));
    expect(rt.screen.queryByTestId('live-title')).toBeNull();
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(rt.orientation.OrientationLock.LANDSCAPE);

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Exit fullscreen' }));
    expect(rt.screen.getByTestId('live-title')).toBeTruthy();

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Close video' }));
    await rt.until(() => expect(app.getPathname()).toBe('/live'));
  });
});
