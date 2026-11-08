/**
 * E2E: the mini player — the video page's close arrow returns to the list while playback continues
 * in a floating tile (YouTube-style); tapping the tile reopens the page on the same player, ✕ stops
 * it, and opening other media or leaving the page any other way doesn't leave it playing.
 */
import { LIVESTREAM_ID, techCreator } from '@test/fixtures';

import { loadRuntime, type Runtime } from './helpers/runtime';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

const POST_ID = 'ch-tech-main-01';
const OTHER_ID = 'ch-tech-main-02';

const player = () => rt.mockVideoPlayerState.lastPlayer();
/** The player a `VideoView` (by testID) currently shows. */
const shownIn = (testID: 'video-view' | 'mini-player-video') => rt.mockVideoPlayerState.viewsByTestID.get(testID)?.player;

async function openVideo(id = POST_ID) {
  await rt.until(() => expect(rt.inTab('index').getByTestId(`video-list-item-${id}`)).toBeTruthy());
  await rt.fireEvent.press(rt.inTab('index').getByTestId(`video-list-item-${id}`));
  await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
}

/** Sign in, open the first video and let it start playing. */
async function playVideo() {
  rt.seedSession();
  await rt.renderApp();
  await openVideo();
  await rt.act(async () => player().setStatus('readyToPlay'));
  expect(player().playing).toBe(true);
}

async function minimize() {
  await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Close video' }));
  await rt.until(() => expect(rt.screen.getByTestId('mini-player')).toBeTruthy());
}

describe('the close arrow', () => {
  it('goes back to the list and keeps the same player going in the top-right mini player', async () => {
    await playVideo();
    const playing = player();

    await minimize();
    expect(rt.screen.queryByTestId('video-screen')).toBeNull();
    expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();
    expect(rt.screen.getByLabelText('Mini player, corner top-right')).toBeTruthy();
    expect(shownIn('mini-player-video')).toBe(playing);
    expect(rt.mockVideoPlayerState.players).toHaveLength(1);
    expect(playing.playing).toBe(true);
    expect(playing.release).not.toHaveBeenCalled();
  });

  it('keeps the mini player across tabs', async () => {
    await playVideo();
    await minimize();
    await rt.selectTab('history');
    expect(rt.screen.getByTestId('mini-player')).toBeTruthy();
  });

  it('keeps saving watch progress while minimized', async () => {
    await playVideo();
    await minimize();

    player().currentTime = 95;
    await rt.act(async () => {
      player().emit('timeUpdate', { currentTime: 95, bufferedPosition: 95, currentLiveTimestamp: null, currentOffsetFromLive: null });
    });
    await rt.until(() => expect(rt.api.progress.get(POST_ID)).toBe(95));
  });
});

describe('the mini player', () => {
  it('reopens the video page on the same player when tapped, without restarting it', async () => {
    await playVideo();
    const playing = player();
    playing.currentTime = 120;
    await minimize();
    const seeks = playing.seeks.length;

    await rt.fireEvent.press(rt.screen.getByLabelText('Open Main Channel Video 01'));
    await rt.until(() => expect(rt.screen.getByTestId('video-screen')).toBeTruthy());
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();
    expect(rt.mockVideoPlayerState.players).toHaveLength(1);
    expect(shownIn('video-view')).toBe(playing);
    expect(playing.seeks).toHaveLength(seeks);

    // Minimizing again hands the same player back to the tile.
    await minimize();
    expect(shownIn('mini-player-video')).toBe(playing);
  });

  it('pauses / resumes, and ✕ stops playback', async () => {
    await playVideo();
    await minimize();

    await rt.fireEvent.press(rt.screen.getByLabelText('Pause'));
    expect(player().playing).toBe(false);
    await rt.fireEvent.press(rt.screen.getByLabelText('Play'));
    expect(player().playing).toBe(true);

    await rt.fireEvent.press(rt.screen.getByLabelText('Close mini player'));
    await rt.until(() => expect(rt.screen.queryByTestId('mini-player')).toBeNull());
    expect(player().playing).toBe(false);
    expect(player().release).toHaveBeenCalled();
  });

  it('is replaced when another video opens', async () => {
    await playVideo();
    const first = player();
    await minimize();

    await openVideo(OTHER_ID);
    expect(first.release).toHaveBeenCalled();
    expect(player()).not.toBe(first);
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();

    // Leaving the new video normally doesn't bring the old one back.
    await rt.act(async () => rt.router.back());
    await rt.until(() => expect(rt.screen.queryByTestId('video-screen')).toBeNull());
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();
  });
});

describe('leaving the page another way', () => {
  it('a back gesture / Android back stops playback instead of minimizing', async () => {
    await playVideo();
    const playing = player();

    await rt.act(async () => rt.router.back());
    await rt.until(() => expect(rt.screen.queryByTestId('video-screen')).toBeNull());
    await rt.advanceTime(10);
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();
    expect(playing.release).toHaveBeenCalled();
  });
});

describe('live streams', () => {
  it('minimize into the mini player and reopen the live page on the same player', async () => {
    rt.api.liveNow.add(LIVESTREAM_ID);
    rt.seedSession();
    await rt.renderApp();
    await rt.selectTab('live');
    await rt.until(() => expect(rt.inTab('live').getByTestId('live-status-live')).toBeTruthy());
    await rt.fireEvent.press(rt.inTab('live').getByTestId(`live-stream-${techCreator.id}`));
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
    await rt.act(async () => player().setStatus('readyToPlay'));
    const live = player();

    await minimize();
    expect(rt.screen.queryByTestId('live-screen')).toBeNull();

    await rt.fireEvent.press(rt.screen.getByTestId('mini-player-expand'));
    await rt.until(() => expect(rt.screen.getByTestId('live-screen')).toBeTruthy());
    await rt.until(() => expect(rt.screen.getByTestId('video-player')).toBeTruthy());
    expect(shownIn('video-view')).toBe(live);
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();
  });
});
