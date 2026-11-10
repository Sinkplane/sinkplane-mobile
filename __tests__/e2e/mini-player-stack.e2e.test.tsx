/**
 * E2E: the mini player with player pages stacked on top of each other (a video opened from a
 * notification over another one): suspended sessions, handing the right player to the tile.
 */
import { loadRuntime, type Runtime } from './helpers/runtime';
import {
  goBack,
  minimize,
  openVideo,
  OTHER_ID,
  player,
  playVideo,
  POST_ID,
  pushRoute,
  shownIn,
} from './helpers/mini-player-page';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

describe('player pages stacked on top of each other', () => {
  /** Press the close arrow of the topmost video page (several can be mounted in a stack). */
  async function minimizeTop() {
    const top = rt.screen.getAllByTestId('video-screen').at(-1);
    if (!top) {
      throw new Error('No video page is mounted');
    }
    await rt.fireEvent.press(rt.within(top).getByRole('button', { name: 'Close video' }));
    await rt.until(() => {
      expect(rt.screen.getByTestId('mini-player')).toBeTruthy();
    });
  }

  it('a video pushed over another one suspends it; back on top, its close arrow hands it to the tile', async () => {
    await playVideo(rt);
    const a = player(rt);

    // Video B opens on top of A's page (a notification): A pauses — its page is kept mounted
    // underneath (hidden by the stack activity), so its session is suspended, not released.
    await pushRoute(rt, `/video/${OTHER_ID}`);
    await rt.until(() => {
      expect(rt.mockVideoPlayerState.players).toHaveLength(2);
    });
    await rt.until(() => {
      expect(a.playing).toBe(false);
    });
    expect(a.released).toBe(false);
    const b = player(rt);
    await rt.act(() => {
      b.setStatus('readyToPlay');
    });
    expect(b.playing).toBe(true);

    // Back to A: its suspended session returns — the page shows its own player again, paused,
    // and no fresh player is created.
    await goBack(rt);
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-player')).toBeTruthy();
    });
    await rt.until(() => {
      expect(b.released).toBe(true);
    });
    expect(rt.mockVideoPlayerState.players).toHaveLength(2);
    expect(a.released).toBe(false);
    expect(a.playing).toBe(false);

    // Play A again from its controls, then its close arrow hands that player to the mini player.
    await rt.fireEvent.press(rt.screen.getByLabelText('Play'));
    await rt.until(() => {
      expect(a.playing).toBe(true);
    });
    await minimize(rt);

    expect(rt.screen.queryByTestId('video-screen')).toBeNull();
    expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();
    expect(shownIn(rt, 'mini-player-video')).toBe(a);
    expect(a.playing).toBe(true);
  });

  it('minimizing the top video with another page underneath returns to the list and drops the one below', async () => {
    await playVideo(rt);
    const a = player(rt);

    await pushRoute(rt, `/video/${OTHER_ID}`);
    await rt.until(() => {
      expect(rt.mockVideoPlayerState.players).toHaveLength(2);
    });
    const b = player(rt);
    await rt.act(() => {
      b.setStatus('readyToPlay');
    });

    // B's close arrow: back to the list — A's page underneath goes away too, or it would cover
    // the tile — and the mini player carries B, while A's suspended player is released.
    await minimizeTop();
    expect(rt.screen.queryByTestId('video-screen')).toBeNull();
    expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();
    expect(shownIn(rt, 'mini-player-video')).toBe(b);
    expect(b.playing).toBe(true);
    await rt.advanceTime(10);
    expect(a.released).toBe(true);
    expect(rt.mockVideoPlayerState.players).toHaveLength(2);
  });

  it('a page backed out of before its video ever loaded hands the covered page its session back', async () => {
    await playVideo(rt);
    const a = player(rt);

    // Video B opens on top (a notification), but its post/delivery never resolve (slow network):
    // B never reaches a player, so A's page underneath suspends instead of being released.
    rt.api.latencyMs = 60000;
    await pushRoute(rt, `/video/${OTHER_ID}`);
    await rt.until(() => {
      expect(rt.screen.getByTestId('player-placeholder')).toBeTruthy();
    });
    await rt.until(() => {
      expect(a.playing).toBe(false);
    });
    expect(rt.screen.queryByTestId('video-player')).toBeNull(); // B's page is the one on top
    expect(rt.mockVideoPlayerState.players).toHaveLength(1);
    expect(a.released).toBe(false);

    // Back to A before B ever loaded: the closing page left no session (it never got a player),
    // so A's suspended session is restored and its page shows its own player again…
    rt.api.latencyMs = 0;
    await goBack(rt);
    await rt.until(() => {
      expect(rt.screen.getAllByTestId('video-player')).toHaveLength(1);
      expect(rt.screen.queryByTestId('player-placeholder')).toBeNull();
    });

    // …so A's close arrow now hands A's own player to the mini player tile.
    await minimize(rt);
    expect(rt.screen.queryByTestId('video-screen')).toBeNull();
    expect(shownIn(rt, 'mini-player-video')).toBe(a);
    expect(a.released).toBe(false);
  });

  it('a covered page whose stream becomes ready seeks to its progress but never plays behind the one on top', async () => {
    rt.seedSession();
    rt.api.progress.set(POST_ID, 48); // where a previous watch of A left off
    await rt.renderApp();
    await openVideo(rt);
    const a = player(rt);
    expect(a.playing).toBe(false); // A's stream is still loading

    // B opens on top (a notification) and becomes the session; A suspends.
    await pushRoute(rt, `/video/${OTHER_ID}`);
    await rt.until(() => {
      expect(rt.mockVideoPlayerState.players).toHaveLength(2);
    });
    const b = player(rt);
    await rt.act(() => {
      b.setStatus('readyToPlay');
    });
    await rt.until(() => {
      expect(b.playing).toBe(true);
    });
    await rt.until(() => {
      expect(a.playing).toBe(false);
    });
    expect(a.released).toBe(false);

    // A's stream becomes ready only now: it finishes the resume seek to its saved progress, but
    // must not autoplay behind B's page (B keeps playing untouched).
    await rt.act(() => {
      a.setStatus('readyToPlay');
    });
    await rt.advanceTime(100);
    expect(a.seeks).toEqual([48]);
    expect(a.play).not.toHaveBeenCalled();
    expect(a.playing).toBe(false);
    expect(b.playing).toBe(true);

    // Back to A: it is the session again, paused — playing it is up to the user.
    await goBack(rt);
    await rt.until(() => {
      expect(b.released).toBe(true);
    });
    await rt.until(() => {
      expect(rt.screen.getAllByTestId('video-player')).toHaveLength(1);
    });
    expect(a.playing).toBe(false);
    await rt.fireEvent.press(rt.screen.getByLabelText('Play'));
    await rt.until(() => {
      expect(a.playing).toBe(true);
    });
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();
  });
});
