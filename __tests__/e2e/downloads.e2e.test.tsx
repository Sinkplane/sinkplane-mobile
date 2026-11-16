/**
 * E2E: Settings › Downloads — the list of downloaded videos (newest first, total size), playing
 * one offline from the local file, its menu (Save to Photos / Delete) and Delete all; and the
 * offline launch, which signs out (the session can't load), still reaching the downloads from the
 * sign-in screen.
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

async function playDownload(postId: string): Promise<void> {
  await rt.fireEvent.press(rt.screen.getByTestId(`download-row-${postId}`));
  await rt.until(() => {
    expect(rt.screen.getByTestId('downloaded-video-screen')).toBeTruthy();
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
    const requestsBefore = rt.api.requests.length;
    await playDownload('post-1');

    expect(rt.mockVideoPlayerState.lastPlayer().source).toMatchObject({
      uri: downloadUri('post-1'),
    });
    expect(rt.screen.getByTestId('downloaded-video-details')).toHaveTextContent(
      /Home Lab TourTech ChannelDownloaded · 1080p · 1\.2 GB/,
    );
    expect(rt.api.requests.slice(requestsBefore)).toEqual([]);
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

  it('deleting from the player page closes it', async () => {
    await openDownloads();
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

describe('offline launch', () => {
  it('signs out, but the downloads still play from the sign-in screen', async () => {
    rt.seedDownloads();
    rt.seedSession();
    rt.api.offline = true;
    await rt.renderApp();

    await rt.until(() => {
      expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy();
    });
    await rt.fireEvent.press(rt.screen.getByRole('link', { name: 'Watch downloaded videos (2)' }));
    await rt.until(() => {
      expect(rowIds()).toEqual(['post-2', 'post-1']);
    });
    await playDownload('post-2');
    expect(rt.mockVideoPlayerState.lastPlayer().source).toMatchObject({
      uri: downloadUri('post-2'),
    });

    await rt.fireEvent.press(rt.screen.getByLabelText('Close video'));
    await rt.until(() => {
      expect(rt.screen.getByTestId('downloads-screen')).toBeTruthy();
    });
    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Back' }));
    await rt.until(() => {
      expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy();
    });
  });

  it('without downloads the sign-in screen has no downloads link', async () => {
    rt.seedSession();
    rt.api.offline = true;
    await rt.renderApp();
    await rt.until(() => {
      expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy();
    });
    expect(rt.screen.queryByTestId('sign-in-downloads')).toBeNull();
  });
});
