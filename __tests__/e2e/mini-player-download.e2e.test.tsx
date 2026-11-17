/**
 * E2E: the mini player and downloads — a session is keyed by what it plays: `video:<id>` while it
 * streams, `download:<id>` once the post is downloaded. A video downloaded while it plays and then
 * minimized therefore reopens on a NEW player for the local file (the streaming one is released),
 * while a minimized download reopens on the very same player.
 */
import { downloadUri } from '@test/fixtures-downloads';

import { loadRuntime, type Runtime } from './helpers/runtime';
import { minimize, player, playVideo, POST_ID, shownIn } from './helpers/mini-player-page';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

const INDEX_FILE = 'file:///document/downloads/index.json';
const reopen = async (): Promise<void> => {
  await rt.fireEvent.press(rt.screen.getByLabelText('Open Main Channel Video 01'));
  await rt.until(() => {
    expect(rt.screen.getByTestId('video-screen')).toBeTruthy();
    expect(rt.screen.getByTestId('video-player')).toBeTruthy();
  });
};

/** Downloads the playing video's 720p from its page and waits until it is saved. */
async function downloadWhilePlaying(): Promise<void> {
  await rt.fireEvent.press(rt.screen.getByTestId('download-button'));
  await rt.until(() => {
    expect(rt.screen.getByTestId('download-option-720-avc1')).toBeTruthy();
  });
  await rt.fireEvent.press(rt.screen.getByTestId('download-option-720-avc1'));
  await rt.until(() => {
    expect(rt.fileSystem.downloads).toHaveLength(1);
  });
  await rt.act(() => {
    rt.fileSystem.lastDownload().finish(230_686_720);
  });
  await rt.until(() => {
    expect(rt.fileSystem.files.has(INDEX_FILE)).toBe(true);
  });
}

describe('a video downloaded while it plays', () => {
  it('reopens from the mini player on a new player for the local file, releasing the stream', async () => {
    await playVideo(rt);
    const streaming = player(rt);
    expect(streaming.source).toMatchObject({ contentType: 'hls' });
    await downloadWhilePlaying();

    await minimize(rt);
    expect(shownIn(rt, 'mini-player-video')).toBe(streaming);
    await reopen();

    const local = player(rt);
    expect(local).not.toBe(streaming);
    expect(rt.mockVideoPlayerState.players).toHaveLength(2);
    expect(local.source).toMatchObject({ uri: downloadUri(POST_ID) });
    expect(streaming.released).toBe(true);
    expect(local.released).toBe(false);
    expect(shownIn(rt, 'video-view')).toBe(local);
    expect(rt.screen.queryByTestId('mini-player')).toBeNull();
  });
});

describe('a downloaded video', () => {
  it('reopens from the mini player on the very same player, without restarting it', async () => {
    rt.seedDownloads([
      {
        postId: POST_ID,
        title: 'Main Channel Video 01',
        channel: 'Main Channel',
        label: '720p',
        sizeBytes: 230_686_720,
        durationSeconds: 600,
        downloadedAt: '2026-11-10T12:00:00.000Z',
        hasThumbnail: false,
      },
    ]);
    await playVideo(rt);
    const local = player(rt);
    expect(local.source).toMatchObject({ uri: downloadUri(POST_ID) });
    local.currentTime = 120;

    await minimize(rt);
    const seeks = local.seeks.length;
    await reopen();

    expect(rt.mockVideoPlayerState.players).toHaveLength(1);
    expect(shownIn(rt, 'video-view')).toBe(local);
    expect(local.seeks).toHaveLength(seeks);
    expect(local.released).toBe(false);
    expect(rt.api.deliveryRequests('onDemand')).toEqual([]);
  });
});
