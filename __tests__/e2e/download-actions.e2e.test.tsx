/**
 * E2E: the download menu's other entry points and failure copy — the list item's accessibility
 * action, a failing / denied Save to Photos, and History items without a video.
 */
import { downloadUri } from '@test/fixtures-downloads';
import { pressAlertButton } from '@test/alert';
import { FIXED_NOW, makeVideo, techCreator, techMainChannel } from '@test/fixtures';

import { loadRuntime, type Runtime } from './helpers/runtime';
import { firstTechVideo, POST_ID } from './helpers/video-page';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

async function openApp(): Promise<void> {
  rt.notifications.mockNotifications.promptAnswer = 'denied';
  rt.seedSession();
  await rt.renderApp();
  await rt.until(() => {
    expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();
  });
}

describe('the list item accessibility action', () => {
  const item = () => rt.inTab('index').getByTestId(`video-list-item-${POST_ID}`);
  const accessibilityAction = (actionName: string) =>
    rt.fireEvent(item(), 'accessibilityAction', { nativeEvent: { actionName } });

  beforeEach(openApp);

  it('longpress opens the download menu for that video', async () => {
    await accessibilityAction('longpress');
    await rt.until(() => {
      expect(rt.screen.getByTestId('download-actions-title')).toHaveTextContent(
        'Main Channel Video 01',
      );
    });
  });

  it('any other action opens nothing', async () => {
    await accessibilityAction('activate');
    expect(rt.screen.queryByTestId('download-sheet')).toBeNull();
  });
});

describe('Save to Photos failures', () => {
  const settingsRow = () => rt.inTab('settings').getByTestId('settings-downloads');

  async function openDownloads(): Promise<void> {
    rt.seedDownloads();
    await openApp();
    await rt.selectTab('settings');
    await rt.until(() => {
      expect(rt.selectedTab()).toBe('settings');
    });
    await rt.fireEvent.press(settingsRow());
    await rt.until(() => {
      expect(rt.screen.getByTestId('downloads-screen')).toBeTruthy();
    });
  }

  it('a failing save from a row menu says so and saves nothing', async () => {
    rt.mediaLibrary.saveError = new Error('Library full');
    await openDownloads();
    await rt.fireEvent.press(rt.screen.getByTestId('download-more-post-1'));
    await rt.act(async () => {
      pressAlertButton(rt.alert, 'Save to Photos');
      await Promise.resolve();
    });
    await rt.until(() => {
      expect(rt.screen.getByTestId('save-to-photos-status')).toHaveTextContent(
        "Couldn't save to Photos. Try again.",
      );
    });
    expect(rt.mediaLibrary.saved).toEqual([]);
  });

  it('a denied save on the downloaded-video page links to Settings', async () => {
    rt.mediaLibrary.granted = false;
    await openDownloads();
    await rt.fireEvent.press(rt.screen.getByTestId('download-row-post-1'));
    await rt.until(() => {
      expect(rt.screen.getByTestId('downloaded-video-screen')).toBeTruthy();
    });
    await rt.fireEvent.press(rt.screen.getByTestId('downloaded-save-to-photos'));
    await rt.until(() => {
      expect(rt.screen.getByTestId('save-to-photos-status')).toHaveTextContent(
        'Allow access to Photos to save videos. Open Settings',
      );
    });
    expect(rt.mediaLibrary.saved).toEqual([]);
    expect(rt.fileSystem.files.has(downloadUri('post-1'))).toBe(true);
  });
});

describe('History items', () => {
  it('without a video get no long-press menu, with one they do', async () => {
    const textPost = makeVideo(techCreator, techMainChannel, {
      id: 'text-post',
      title: 'Text only',
      hasVideo: false,
    });
    rt.api.seedHistoryEntry(textPost, 0, FIXED_NOW.toISOString());
    rt.api.seedHistoryEntry(
      firstTechVideo(rt),
      10,
      new Date(FIXED_NOW.getTime() - 1000).toISOString(),
    );
    await openApp();
    await rt.selectTab('history');
    await rt.until(() => {
      expect(rt.inTab('history').getByTestId('video-list-item-text-post')).toBeTruthy();
    });

    await rt.fireEvent(rt.inTab('history').getByTestId('video-list-item-text-post'), 'longPress');
    expect(rt.screen.queryByTestId('download-sheet')).toBeNull();

    await rt.fireEvent(rt.inTab('history').getByTestId(`video-list-item-${POST_ID}`), 'longPress');
    await rt.until(() => {
      expect(rt.screen.getByTestId('download-actions-title')).toBeTruthy();
    });
  });
});
