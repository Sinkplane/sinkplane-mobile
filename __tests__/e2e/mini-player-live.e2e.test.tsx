/**
 * E2E: the mini player with live streams — minimizing / reopening the live page, and reloads.
 */
import { LIVESTREAM_ID, techCreator } from '@test/fixtures';

import { loadRuntime, type Runtime } from './helpers/runtime';
import {
  failStream,
  goBack,
  minimize,
  player,
  playLiveStream,
  shownIn,
} from './helpers/mini-player-page';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

describe('live streams', () => {
  it('minimize into the mini player and reopen the live page on the same player', async () => {
    await playLiveStream(rt, LIVESTREAM_ID);
    const live = player(rt);

    await minimize(rt);
    expect(rt.screen.queryByTestId('live-screen')).toBeNull();

    await rt.fireEvent.press(rt.screen.getByTestId('mini-player-expand'));
    await rt.until(() => {
      expect(rt.screen.getByTestId('live-screen')).toBeTruthy();
    });
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-player')).toBeTruthy();
    });
    expect(shownIn(rt, 'video-view')).toBe(live);
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();
  });

  it('a reload attempt gets a fresh player; reopening the tile afterwards reuses that player', async () => {
    await playLiveStream(rt, LIVESTREAM_ID);
    const first = player(rt);

    // A playback error reloads the stream with a fresh player (fresh signed URL) 5s later: the
    // reload ends this stream's session first, so the remount can't reuse the erroring player.
    await failStream(rt);
    expect(rt.screen.getByTestId('player-error')).toBeTruthy();
    await rt.advanceTime(5000);
    await rt.until(() => {
      expect(rt.mockVideoPlayerState.players).toHaveLength(2);
    });
    await rt.advanceTime(10);
    const reloaded = player(rt);
    expect(reloaded).not.toBe(first);
    expect(first.release).toHaveBeenCalled();
    await rt.act(() => {
      reloaded.setStatus('readyToPlay');
    });

    // The tile carries the reloaded stream…
    await minimize(rt);
    expect(shownIn(rt, 'mini-player-video')).toBe(reloaded);
    expect(reloaded.playing).toBe(true);

    // …and reopening the live page takes that same player over: the session is keyed by the
    // creator, so the reload bookkeeping starting over doesn't force a fresh player anymore.
    await rt.fireEvent.press(rt.screen.getByTestId('mini-player-expand'));
    await rt.until(() => {
      expect(rt.screen.getByTestId('live-screen')).toBeTruthy();
    });
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-player')).toBeTruthy();
    });
    expect(rt.mockVideoPlayerState.players).toHaveLength(2);
    expect(shownIn(rt, 'video-view')).toBe(reloaded);
    expect(reloaded.playing).toBe(true);
    expect(reloaded.release).not.toHaveBeenCalled();
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();
  });

  it("a reload whose refetch resolves after the page was left doesn't disturb the stream opened later", async () => {
    await playLiveStream(rt, LIVESTREAM_ID);
    const first = player(rt);

    // A recoverable playback error schedules a reload in 5s…
    await failStream(rt);
    // …whose status refetch is still in flight (a slow network) when the user gives up and leaves.
    rt.api.latencyMs = 30000;
    await rt.advanceTime(5000);
    await goBack(rt);
    await rt.until(() => {
      expect(rt.screen.queryByTestId('live-screen')).toBeNull();
    });
    await rt.advanceTime(10);
    expect(first.released).toBe(true);

    // Coming back to the live page later starts a fresh, working stream.
    rt.api.latencyMs = 0;
    await rt.fireEvent.press(rt.inTab('live').getByTestId(`live-stream-${techCreator.id}`));
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-player')).toBeTruthy();
    });
    const reopened = player(rt);
    expect(reopened).not.toBe(first);
    await rt.act(() => {
      reopened.setStatus('readyToPlay');
    });
    expect(reopened.playing).toBe(true);

    // The abandoned reload's refetch only resolves now: the page it belonged to is gone, so it
    // must not close (and so stop) the session the reopened page is playing through.
    await rt.advanceTime(30000);
    expect(reopened.playing).toBe(true);
    expect(reopened.release).not.toHaveBeenCalled();
    expect(rt.mockVideoPlayerState.players).toHaveLength(2);
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();
  });
});
