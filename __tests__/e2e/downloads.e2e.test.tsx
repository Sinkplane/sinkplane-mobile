/**
 * E2E: Settings › Downloads — the list of downloaded videos (newest first, total size), playing
 * one offline from the local file, its menu (Save to Photos / Delete) and Delete all; the
 * and the "Show downloaded videos" list in Settings. (The offline launch is in
 * offline-launch.e2e.test.tsx.)
 */
import { alertLabels, lastAlert, pressAlertButton } from '@test/alert';
import { downloadUri } from '@test/fixtures-downloads';

import { loadRuntime, type Runtime } from './helpers/runtime';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

const settingsRow = () => rt.inTab('settings').getByTestId('settings-downloads');
const rowIds = () =>
  rt.screen
    .queryAllByTestId(/^download-row-/)
    .map((row) => String(row.props['testID']).replace('download-row-', ''));

/** Signed in, on Settings, with the default two downloads on the device. */
async function openSettings(): Promise<void> {
  rt.notifications.mockNotifications.promptAnswer = 'denied';
  rt.seedDownloads();
  rt.seedSession();
  await rt.renderApp();
  await rt.until(() => {
    expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();
  });
  await rt.selectTab('settings');
  await rt.until(() => {
    expect(rt.selectedTab()).toBe('settings');
  });
}

async function openDownloads(): Promise<void> {
  await openSettings();
  await rt.fireEvent.press(settingsRow());
  await rt.until(() => {
    expect(rt.screen.getByTestId('downloads-screen')).toBeTruthy();
  });
}

/** Opens a row: the one video page, which plays the file from the device. */
async function playDownload(postId: string): Promise<void> {
  await rt.fireEvent.press(rt.screen.getByTestId(`download-row-${postId}`));
  await rt.until(() => {
    expect(rt.screen.getByTestId('video-screen')).toBeTruthy();
    expect(rt.screen.getByTestId('video-player')).toBeTruthy();
  });
}

/** The connection drops: the page falls back to what the download itself knows. */
async function goOffline(): Promise<void> {
  rt.api.offline = true;
  await rt.act(() => {
    rt.network.offline();
  });
}

describe('Settings › Downloads', () => {
  it('sums up the downloads and lists them newest first', async () => {
    await openSettings();
    expect(settingsRow()).toHaveTextContent('Downloaded videos2 videos · 1.4 GB');

    await rt.fireEvent.press(settingsRow());
    await rt.until(() => {
      expect(rt.screen.getByTestId('downloads-summary')).toHaveTextContent('2 videos · 1.4 GB');
    });
    expect(rowIds()).toEqual(['post-2', 'post-1']);
  });

  it('plays a download from its local file, without asking the API for a stream', async () => {
    await openDownloads();
    await playDownload('post-1');

    expect(rt.mockVideoPlayerState.lastPlayer().source).toMatchObject({
      uri: downloadUri('post-1'),
    });
    expect(rt.api.deliveryRequests('onDemand')).toEqual([]);
    expect(rt.screen.getByTestId('video-screen')).toBeTruthy();
  });

  it("a row's menu deletes it; Settings shows what's left", async () => {
    await openDownloads();
    await rt.fireEvent.press(rt.screen.getByTestId('download-more-post-2'));
    expect(alertLabels(rt.alert)).toEqual(['Save to Photos', 'Delete download', 'Cancel']);
    await rt.act(() => {
      pressAlertButton(rt.alert, 'Delete download');
    });
    expect(rowIds()).toEqual(['post-1']);
    expect(rt.fileSystem.files.has(downloadUri('post-2'))).toBe(false);

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Back' }));
    await rt.until(() => {
      expect(settingsRow()).toHaveTextContent('Downloaded videos1 video · 1.2 GB');
    });
  });

  it('Save to Photos copies a download into the library', async () => {
    await openDownloads();
    await rt.fireEvent.press(rt.screen.getByTestId('download-more-post-1'));
    await rt.act(async () => {
      pressAlertButton(rt.alert, 'Save to Photos');
      await Promise.resolve();
    });
    await rt.until(() => {
      expect(rt.screen.getByTestId('save-to-photos-status')).toHaveTextContent('Saved to Photos.');
    });
    expect(rt.mediaLibrary.saved).toEqual([downloadUri('post-1')]);
  });

  it('Delete all empties the list', async () => {
    await openDownloads();
    await rt.fireEvent.press(rt.screen.getByTestId('downloads-delete-all'));
    expect(lastAlert(rt.alert).title).toBe('Delete all downloads?');
    await rt.act(() => {
      pressAlertButton(rt.alert, 'Delete all');
    });
    expect(rowIds()).toEqual([]);
    expect(rt.screen.getByTestId('downloads-empty')).toBeTruthy();
    expect(rt.fileSystem.files.has(downloadUri('post-1'))).toBe(false);
  });

  it('offline, with no saved post, the page shows the download and plays it', async () => {
    await openDownloads();
    await goOffline();
    await playDownload('post-1');

    expect(rt.mockVideoPlayerState.lastPlayer().source).toMatchObject({
      uri: downloadUri('post-1'),
    });
    expect(rt.screen.getByTestId('downloaded-video-details')).toHaveTextContent(
      /Home Lab TourTech ChannelDownloaded · 1080p · 1\.2 GB/,
    );
    expect(rt.api.deliveryRequests('onDemand')).toEqual([]);
  });

  it('deleting from the player page closes it', async () => {
    await openDownloads();
    await goOffline();
    await playDownload('post-1');
    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Delete download' }));
    await rt.act(() => {
      pressAlertButton(rt.alert, 'Delete');
    });
    await rt.until(() => {
      expect(rt.screen.getByTestId('downloads-screen')).toBeTruthy();
    });
    expect(rowIds()).toEqual(['post-2']);
  });
});

describe('Settings › Show downloaded videos', () => {
  const settings = () => rt.inTab('settings');

  async function showDownloads(): Promise<void> {
    await openSettings();
    await rt.fireEvent(settings().getByTestId('settings-show-downloads'), 'valueChange', true);
    await rt.until(() => {
      expect(settings().getByTestId('settings-downloaded-list')).toBeTruthy();
    });
  }

  it('is off by default; the switch reveals every download', async () => {
    await openSettings();
    expect(settings().getByTestId('settings-show-downloads').props['value']).toBe(false);
    expect(settings().queryByTestId('settings-downloaded-list')).toBeNull();

    await showDownloads();
    expect(settings().getByTestId('settings-download-post-2')).toHaveTextContent(
      'Server Rack Build720p · 220 MB',
      { exact: true },
    );
    expect(settings().getByTestId('settings-download-post-1')).toHaveTextContent(
      'Home Lab Tour1080p · 1.2 GB',
      { exact: true },
    );
  });

  it('trash → confirm removes that row and its files, the others stay', async () => {
    await showDownloads();
    await rt.fireEvent.press(settings().getByTestId('settings-delete-download-post-1'));
    expect(lastAlert(rt.alert).title).toBe('Delete this download?');
    expect(settings().getByTestId('settings-download-post-1')).toBeTruthy();

    await rt.act(async () => {
      pressAlertButton(rt.alert, 'Delete');
      await Promise.resolve();
    });
    await rt.until(() => {
      expect(settings().queryByTestId('settings-download-post-1')).toBeNull();
    });
    expect(settings().getByTestId('settings-download-post-2')).toBeTruthy();
    expect(rt.fileSystem.files.has(downloadUri('post-1'))).toBe(false);
    expect(rt.fileSystem.files.has(downloadUri('post-2'))).toBe(true);
    expect(settingsRow()).toHaveTextContent('Downloaded videos1 video · 220 MB');
  });

  it('declining the confirmation keeps everything', async () => {
    await showDownloads();
    await rt.fireEvent.press(settings().getByTestId('settings-delete-download-post-1'));
    await rt.act(async () => {
      pressAlertButton(rt.alert, 'Cancel');
      await Promise.resolve();
    });
    expect(settings().getByTestId('settings-download-post-1')).toBeTruthy();
    expect(rt.fileSystem.files.has(downloadUri('post-1'))).toBe(true);
  });

  it('Delete all → confirm removes every download and hides the list', async () => {
    await showDownloads();
    await rt.fireEvent.press(settings().getByTestId('settings-delete-all-downloads'));
    expect(lastAlert(rt.alert).title).toBe('Delete all downloads?');
    await rt.act(async () => {
      pressAlertButton(rt.alert, 'Delete all');
      await Promise.resolve();
    });
    await rt.until(() => {
      expect(settings().queryByTestId('settings-show-downloads')).toBeNull();
    });
    expect(rt.fileSystem.files.has(downloadUri('post-1'))).toBe(false);
    expect(rt.fileSystem.files.has(downloadUri('post-2'))).toBe(false);
  });
});
