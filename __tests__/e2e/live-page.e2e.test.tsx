/**
 * E2E: the live player page — live controls, stream ending / coming back, auto-reload after
 * playback errors, "not found" playlists treated as offline, status-check failures, and fullscreen.
 */
import { gamingCreator, LIVESTREAM_ID } from '@test/fixtures';

import {
  failPlayback,
  launch,
  LIVE_PATH,
  liveChecks,
  liveTab,
  openLivePlayer,
  openLiveTab,
  player,
  POLL_MS,
  refreshControl,
  techCard,
} from './helpers/live-flows';
import { loadRuntime, type Runtime } from './helpers/runtime';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

describe('the live player page', () => {
  it('plays the adaptive live playlist with live controls and the stream details', async () => {
    const token = rt.seedSession();
    rt.api.liveNow.add(LIVESTREAM_ID);
    const app = await rt.renderApp();
    await rt.until(() => {
      expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();
    });
    await rt.selectTab('live');
    await rt.until(() => {
      expect(liveTab(rt).getByTestId('live-status-live')).toBeTruthy();
    });
    await rt.fireEvent.press(techCard(rt));
    await rt.until(() => {
      expect(app.getPathname()).toBe(LIVE_PATH);
    });
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-player')).toBeTruthy();
    });

    expect(player(rt).source).toMatchObject({
      uri: `https://live.floatplane.test/${LIVESTREAM_ID}/live-abr.m3u8?token=signed`,
      contentType: 'hls',
      metadata: { title: 'Tech Live: Friday Show', artist: 'Tech Channel' },
    });
    const { headers } = player(rt).source as { headers?: Record<string, string> };
    expect(headers?.['Authorization']).toBe(`Bearer ${token}`);
    expect(rt.screen.getByTestId('live-title')).toHaveTextContent('Tech Live: Friday Show');
    expect(rt.screen.getByTestId('live-description')).toHaveTextContent('Live tech talk & news');

    // Autoplays once ready; the controls have no seeking or speed, only a LIVE badge.
    await rt.act(() => {
      player(rt).setStatus('readyToPlay');
    });
    expect(player(rt).play).toHaveBeenCalled();
    await rt.act(() => {
      player(rt).pause();
    });
    expect(rt.screen.getByTestId('player-live-badge')).toBeTruthy();
    expect(rt.screen.queryByTestId('player-time')).toBeNull();
    expect(rt.screen.queryByTestId('player-seek-bar')).toBeNull();
    expect(rt.screen.queryByRole('button', { name: /seconds$/ })).toBeNull();
    expect(rt.screen.queryByRole('button', { name: /^Playback speed/ })).toBeNull();
    // No watch progress for live streams.
    expect(rt.api.requestsTo('/api/v3/content/progress', 'POST')).toHaveLength(0);
  });

  it('shows the not-live notice when the stream ends, and plays again once it is back', async () => {
    await openLivePlayer(rt);

    rt.api.liveNow.delete(LIVESTREAM_ID);
    await rt.advanceTime(POLL_MS);
    await rt.until(() => {
      expect(rt.screen.getByText('Tech Channel is not live right now.')).toBeTruthy();
    });
    expect(rt.screen.queryByTestId('video-player')).toBeNull();
    expect(rt.screen.getByTestId('live-title')).toHaveTextContent('We are offline');

    rt.api.liveNow.add(LIVESTREAM_ID);
    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Check again' }));
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-player')).toBeTruthy();
    });
  });

  it('leaves fullscreen when the stream ends there', async () => {
    await openLivePlayer(rt);
    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Enter fullscreen' }));
    expect(rt.screen.queryByTestId('live-title')).toBeNull();

    rt.api.liveNow.delete(LIVESTREAM_ID);
    await rt.advanceTime(POLL_MS);

    await rt.until(() => {
      expect(rt.screen.getByText('Tech Channel is not live right now.')).toBeTruthy();
    });
    expect(rt.screen.getByTestId('live-title')).toHaveTextContent('We are offline');
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(
      rt.orientation.OrientationLock.PORTRAIT_UP,
    );
  });

  it('reloads the stream with a fresh delivery 5 seconds after a playback error', async () => {
    await openLivePlayer(rt);
    const playersBefore = rt.mockVideoPlayerState.players.length;
    const checksBefore = liveChecks(rt).length;

    await failPlayback(rt, 'The network connection was lost.');
    expect(rt.screen.getByTestId('player-error')).toBeTruthy();
    await rt.advanceTime(4000);
    expect(rt.mockVideoPlayerState.players).toHaveLength(playersBefore);

    await rt.advanceTime(1000);
    await rt.until(() => {
      expect(rt.mockVideoPlayerState.players).toHaveLength(playersBefore + 1);
    });
    expect(liveChecks(rt).length).toBeGreaterThan(checksBefore);
    expect(rt.screen.queryByTestId('player-error')).toBeNull();
  });

  it('cancels a pending retry when a status check takes the stream offline', async () => {
    rt.api.liveNow.add(LIVESTREAM_ID);
    await openLiveTab(rt);
    await rt.until(() => {
      expect(liveTab(rt).getByTestId('live-status-live')).toBeTruthy();
    });
    const refresh = refreshControl(rt).onRefresh;
    await rt.fireEvent.press(techCard(rt));
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-player')).toBeTruthy();
    });
    await failPlayback(rt, 'The network connection was lost.');
    rt.api.liveNow.delete(LIVESTREAM_ID);
    await rt.act(() => {
      refresh();
    });
    await rt.until(() => {
      expect(rt.screen.getByText('Tech Channel is not live right now.')).toBeTruthy();
    });

    rt.api.liveNow.add(LIVESTREAM_ID);
    await rt.act(() => {
      refresh();
    });
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-player')).toBeTruthy();
    });
    const recovered = player(rt);
    await rt.advanceTime(6000);
    expect(player(rt)).toBe(recovered);
  });

  it('reloads right away from the error overlay’s Retry', async () => {
    await openLivePlayer(rt);
    const playersBefore = rt.mockVideoPlayerState.players.length;

    await failPlayback(rt);
    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Retry' }));

    await rt.until(() => {
      expect(rt.mockVideoPlayerState.players).toHaveLength(playersBefore + 1);
    });
    // The pending automatic reload was cancelled.
    await rt.advanceTime(6000);
    expect(rt.mockVideoPlayerState.players).toHaveLength(playersBefore + 1);
  });

  it('treats a missing live playlist as offline until the next status check', async () => {
    await openLivePlayer(rt);

    await failPlayback(rt, 'HTTP 404: File Not Found');
    await rt.until(() => {
      expect(rt.screen.getByText('Tech Channel is not live right now.')).toBeTruthy();
    });
    expect(rt.screen.queryByTestId('video-player')).toBeNull();
    await rt.advanceTime(6000); // no automatic reload for a missing stream
    expect(rt.screen.queryByTestId('video-player')).toBeNull();

    // The next poll still reports the stream live, so the player tries again.
    await rt.advanceTime(POLL_MS);
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-player')).toBeTruthy();
    });
  });

  it('offers a retry when the status check fails', async () => {
    rt.api.liveNow.add(LIVESTREAM_ID);
    rt.api.failRequests('GET /api/v3/delivery/info', { status: 503, body: 'down' }, { count: 3 });
    const app = await launch(rt);
    await rt.act(() => {
      rt.router.push(LIVE_PATH);
    });
    await rt.until(() => {
      expect(app.getPathname()).toBe(LIVE_PATH);
    });

    await rt.until(
      () => {
        expect(rt.screen.getByText("Couldn't check the stream status.")).toBeTruthy();
      },
      { maxFakeMs: 15_000 },
    );
    expect(app.getPathname()).toBe(LIVE_PATH);

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Retry' }));
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-player')).toBeTruthy();
    });
  });

  it('says so for a creator without a livestream', async () => {
    const app = await launch(rt);
    await rt.act(() => {
      rt.router.push(`/live/${gamingCreator.id}`);
    });
    await rt.until(() => {
      expect(app.getPathname()).toBe(`/live/${gamingCreator.id}`);
    });

    await rt.until(() => {
      expect(rt.screen.getByText("This creator doesn't stream live on Floatplane.")).toBeTruthy();
    });
  });

  it('goes fullscreen and back, and closes back to the Live tab', async () => {
    const app = await openLivePlayer(rt);

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Enter fullscreen' }));
    expect(rt.screen.queryByTestId('live-title')).toBeNull();
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(
      rt.orientation.OrientationLock.LANDSCAPE,
    );

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Exit fullscreen' }));
    expect(rt.screen.getByTestId('live-title')).toBeTruthy();

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Close video' }));
    await rt.until(() => {
      expect(app.getPathname()).toBe('/live');
    });
  });
});
