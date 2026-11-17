/**
 * E2E: downloading a video into the app — from its page (the quality sheet backed by
 * `scenario=download` delivery info, the signed MP4 transfer with the session headers, progress,
 * cancel, failures, a download that keeps going after the page closes, then the Downloaded menu:
 * Save to Photos and Delete download), and from a long press on a Videos-tab item.
 */
import { BROWSER_USER_AGENT } from '@/shared';
import { makeVideoPost } from '@test/fixtures';

import { loadRuntime, type Runtime } from './helpers/runtime';
import { firstTechVideo, GUID, openVideo, POST_ID, untilPlayable } from './helpers/video-page';

const FILE_720 = `https://edge.floatplane.test/Videos/${GUID}/720.mp4?token=signed-720`;
const DOWNLOADS = 'file:///document/downloads';
const VIDEO_FILE = `${DOWNLOADS}/${POST_ID}.mp4`;
const THUMBNAIL_FILE = `${DOWNLOADS}/${POST_ID}.jpg`;
const PARTIAL_FILE = /\/downloads\/ch-tech-main-01\.\d+\.part$/;
const INDEX_FILE = `${DOWNLOADS}/index.json`;

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

const downloadButton = () => rt.screen.getByTestId('download-button');
const button = (name: string) => rt.screen.getByRole('button', { name });

/** Open the first Tech Main video and its quality sheet. */
async function openSheet(): Promise<void> {
  await openVideo(rt);
  await untilPlayable(rt);
  await rt.fireEvent.press(downloadButton());
  await rt.until(() => {
    expect(rt.screen.getByTestId('download-option-720-avc1')).toBeTruthy();
  });
}

/** Pick 720p and wait for the transfer to start. */
async function download720(): Promise<void> {
  await openSheet();
  await rt.fireEvent.press(rt.screen.getByTestId('download-option-720-avc1'));
  await rt.until(() => {
    expect(rt.fileSystem.downloads).toHaveLength(1);
  });
}

/** The transfer completes; wait until the page shows the video as downloaded. */
async function finishTransfer(sizeBytes = 230_686_720): Promise<void> {
  await rt.act(() => {
    rt.fileSystem.lastDownload().finish(sizeBytes);
  });
  await rt.until(() => {
    expect(rt.fileSystem.files.has(INDEX_FILE)).toBe(true);
  });
}

/** The .part files on disk. */
const partFiles = (): string[] =>
  [...rt.fileSystem.files.keys()].filter((uri) => PARTIAL_FILE.test(uri));

/** The downloads index as written to disk. */
function savedIndex(): unknown {
  return JSON.parse(rt.fileSystem.files.get(INDEX_FILE) ?? '[]');
}

it('lists the qualities best first with their sizes, from the download delivery info', async () => {
  await openSheet();

  expect(button('1080p, 1.2 GB')).toBeTruthy();
  expect(button('720p, 220 MB')).toBeTruthy();
  // 360p reports only bitrates: estimated from the video's duration.
  expect(rt.screen.getByRole('button', { name: /^360p, ~\d+(\.\d)? MB$/ })).toBeTruthy();
  // 4K is denied to the account.
  expect(rt.screen.queryByText('4K')).toBeNull();
  expect(
    rt.screen.getByText('Saved in the app to watch offline (Settings › Downloads).'),
  ).toBeTruthy();

  const requests = rt.api.deliveryRequests('download');
  expect(requests).toHaveLength(1);
  const [request] = requests;
  expect(request?.params.get('entityId')).toBe(GUID);
  expect(request?.bearer).toBeTruthy();
});

it('downloads the chosen quality into the app, showing progress, with its thumbnail', async () => {
  await download720();

  const task = rt.fileSystem.lastDownload();
  expect(task.url).toBe(FILE_720);
  expect(task.headers['User-Agent']).toBe(BROWSER_USER_AGENT);
  expect(task.headers['Authorization']).toMatch(/^Bearer .+/);
  expect(task.destination.uri).toMatch(PARTIAL_FILE);
  expect(task.options.deferBackgroundSessionCompletion).toBe(true);
  // Nothing goes to Photos on its own.
  expect(rt.mediaLibrary.permissionRequests).toEqual([]);
  // The sheet stays open, showing the progress; "Done" only hides it.
  expect(rt.screen.getByTestId('download-action-progress')).toHaveTextContent('Downloading…');
  expect(rt.screen.getByTestId('download-action-close')).toHaveTextContent('Done');

  await rt.act(() => {
    task.progress(55, 200);
  });
  expect(rt.screen.getByTestId('download-action-progress')).toHaveTextContent('Downloading 27%');
  await rt.fireEvent.press(rt.screen.getByTestId('download-action-close'));
  expect(rt.screen.queryByTestId('download-sheet')).toBeNull();
  expect(rt.fileSystem.lastDownload().state).not.toBe('cancelled');
  expect(downloadButton()).toHaveTextContent('Downloading 27%');

  await finishTransfer();
  await rt.until(() => {
    expect(downloadButton()).toHaveTextContent('Downloaded');
  });
  expect(rt.fileSystem.files.has(VIDEO_FILE)).toBe(true);
  expect(partFiles()).toEqual([]);
  expect(task.acknowledged).toBe(1);
  expect(rt.fileSystem.files.has(THUMBNAIL_FILE)).toBe(true);
  expect(rt.fileSystem.fileDownloads[0]?.url).toBe(
    `https://cdn.floatplane.test/videos/${POST_ID}/thumb.jpg`,
  );
  expect(savedIndex()).toEqual([
    expect.objectContaining({
      postId: POST_ID,
      title: 'Main Channel Video 01',
      label: '720p',
      sizeBytes: 230_686_720,
      hasThumbnail: true,
    }),
  ]);
  expect(rt.screen.queryByTestId('download-status')).toBeNull();
  expect(rt.mediaLibrary.saved).toEqual([]);
});

it('Cancel stops the transfer; nothing is kept', async () => {
  await download720();
  await rt.fireEvent.press(rt.screen.getByTestId('download-action-close'));
  await rt.fireEvent.press(button('Cancel download'));

  expect(rt.fileSystem.lastDownload().state).toBe('cancelled');
  expect(downloadButton()).toHaveTextContent('Download');
  expect(rt.screen.queryByTestId('download-status')).toBeNull();
  await rt.until(() => {
    // Only the page's saved copy (post-cache) may remain, never a video file.
    expect([...rt.fileSystem.files.keys()].filter((uri) => !uri.includes('/post-cache/'))).toEqual(
      [],
    );
  });
});

it('Downloaded opens the menu: Save to Photos copies the file, Delete removes it', async () => {
  await download720();
  await finishTransfer();
  await rt.until(() => {
    expect(downloadButton()).toHaveTextContent('Downloaded');
  });

  await rt.fireEvent.press(downloadButton());
  expect(rt.screen.getByTestId('download-actions-note')).toHaveTextContent(
    '720p · 220 MB · Available offline',
  );
  await rt.fireEvent.press(button('Save to Photos'));
  await rt.until(() => {
    expect(button('Saved to Photos')).toBeDisabled();
  });
  expect(rt.mediaLibrary.permissionRequests).toEqual([
    { writeOnly: true, granularPermissions: ['video'] },
  ]);
  expect(rt.mediaLibrary.saved).toEqual([VIDEO_FILE]);

  await rt.fireEvent.press(button('Delete download'));
  expect(rt.screen.queryByTestId('download-sheet')).toBeNull();
  expect(downloadButton()).toHaveTextContent('Download');
  expect(rt.fileSystem.files.has(VIDEO_FILE)).toBe(false);
  expect(rt.fileSystem.files.has(THUMBNAIL_FILE)).toBe(false);
  expect(savedIndex()).toEqual([]);
});

it('Save to Photos with access denied: explains, links to Settings, saves nothing', async () => {
  rt.mediaLibrary.granted = false;
  await download720();
  await finishTransfer();
  await rt.until(() => {
    expect(downloadButton()).toHaveTextContent('Downloaded');
  });
  await rt.fireEvent.press(downloadButton());
  await rt.fireEvent.press(button('Save to Photos'));

  await rt.until(() => {
    expect(rt.screen.getByTestId('download-save-status')).toHaveTextContent(
      'Allow access to Photos to save videos. Open Settings',
    );
  });
  expect(rt.mediaLibrary.saved).toEqual([]);
  const openSettings = jest.spyOn(rt.linking, 'openSettings').mockResolvedValue(undefined);
  await rt.fireEvent.press(rt.screen.getByRole('link', { name: 'Open Settings' }));
  expect(openSettings).toHaveBeenCalled();
});

it('a failed transfer can be retried from the sheet', async () => {
  await download720();
  await rt.act(async () => {
    rt.fileSystem.lastDownload().fail(new Error('HTTP 403'));
    await Promise.resolve();
  });
  await rt.until(() => {
    expect(rt.screen.getByTestId('download-status')).toHaveTextContent(
      "Couldn't download 720p. Try again.",
    );
  });
  expect(partFiles()).toEqual([]);

  await rt.fireEvent.press(downloadButton());
  await rt.until(() => {
    expect(rt.screen.getByTestId('download-option-1080-avc1')).toBeTruthy();
  });
  await rt.fireEvent.press(rt.screen.getByTestId('download-option-1080-avc1'));
  await rt.until(() => {
    expect(rt.fileSystem.downloads).toHaveLength(2);
  });
  expect(rt.fileSystem.lastDownload().url).toContain('/1080.mp4');
});

it('the sheet reports a failing download info request and retries it', async () => {
  rt.api.failRequests(
    'GET /api/v3/delivery/info',
    { status: 500, body: { message: 'Server error' } },
    { where: (req) => req.params.get('scenario') === 'download' },
  );
  await openVideo(rt);
  await untilPlayable(rt);
  await rt.fireEvent.press(downloadButton());
  await rt.until(() => {
    expect(rt.screen.getByText("Couldn't load the download options.")).toBeTruthy();
  });

  await rt.fireEvent.press(rt.screen.getByTestId('download-options-retry'));
  await rt.until(() => {
    expect(rt.screen.getByTestId('download-option-720-avc1')).toBeTruthy();
  });
});

it('keeps downloading after the page closes, and shows it again on return', async () => {
  await download720();
  await rt.act(() => {
    rt.router.back();
  });
  await rt.until(() => {
    expect(rt.screen.queryByTestId('video-screen')).toBeNull();
  });

  await finishTransfer();

  await rt.fireEvent.press(rt.screen.getByTestId(`video-list-item-${POST_ID}`));
  await rt.until(() => {
    expect(downloadButton()).toHaveTextContent('Downloaded');
  });
});

it('image / text posts have no Download button', async () => {
  rt.api.posts.set(POST_ID, makeVideoPost(firstTechVideo(rt), { videoAttachments: false }));
  await openVideo(rt);
  await rt.until(() => {
    expect(rt.screen.getByTestId('video-title')).toBeTruthy();
  });
  expect(rt.screen.queryByTestId('download-button')).toBeNull();
});

describe('long press on a Videos-tab item', () => {
  const ITEM = `video-list-item-${POST_ID}`;
  const BADGE = `download-badge-${POST_ID}`;
  const feedBadge = () => rt.inTab('index').getByTestId(BADGE);

  async function longPressItem(): Promise<void> {
    await rt.fireEvent(rt.inTab('index').getByTestId(ITEM), 'longPress');
    await rt.until(() => {
      expect(rt.screen.getByTestId('download-actions-title')).toHaveTextContent(
        'Main Channel Video 01',
      );
    });
  }

  beforeEach(async () => {
    rt.seedSession();
    await rt.renderApp();
    // getBy throws until the item is listed.
    await rt.until(() => rt.inTab('index').getByTestId(ITEM));
  });

  it('Download… → quality → progress in the menu → downloaded, without opening the video', async () => {
    await longPressItem();
    await rt.fireEvent.press(button('Download…'));
    await rt.until(() => {
      expect(rt.screen.getByTestId('download-option-720-avc1')).toBeTruthy();
    });
    // Feed items list no attachments: the post is looked up for its video's guid.
    expect(rt.api.requestsTo('/api/v3/content/post').map((r) => r.params.get('id'))).toEqual([
      POST_ID,
    ]);
    expect(rt.api.deliveryRequests('download')[0]?.params.get('entityId')).toBe(GUID);
    await rt.fireEvent.press(rt.screen.getByTestId('download-option-720-avc1'));
    await rt.until(() => {
      expect(rt.fileSystem.downloads).toHaveLength(1);
    });
    // Back on the menu with the progress row; nothing opened the video.
    expect(rt.screen.getByTestId('download-action-progress')).toHaveTextContent('Downloading…');
    expect(rt.screen.queryByTestId('video-screen')).toBeNull();
    expect(feedBadge()).toHaveTextContent('', { exact: true });

    await rt.act(() => {
      rt.fileSystem.lastDownload().progress(1, 4);
    });
    expect(rt.screen.getByTestId('download-action-progress')).toHaveTextContent('Downloading 25%');
    expect(feedBadge()).toHaveTextContent('25%', { exact: true });
    expect(feedBadge()).toHaveAccessibleName('Downloading 25%');

    // "Done" hides the menu; the badge keeps showing the progress, and the menu comes back.
    await rt.fireEvent.press(rt.screen.getByTestId('download-action-close'));
    expect(rt.screen.queryByTestId('download-sheet')).toBeNull();
    expect(feedBadge()).toHaveTextContent('25%', { exact: true });
    await longPressItem();
    expect(button('Downloading 25%')).toBeDisabled();
    await rt.fireEvent.press(rt.screen.getByTestId('download-action-close'));

    await finishTransfer();
    expect(feedBadge()).toHaveAccessibleName('Downloaded');
    expect(feedBadge()).toHaveTextContent('', { exact: true });
    await longPressItem();
    expect(button('Play')).toBeTruthy();
    expect(button('Delete download')).toBeTruthy();
    await rt.fireEvent.press(button('Delete download'));
    await rt.until(() => {
      expect(rt.screen.queryByTestId(BADGE)).toBeNull();
    });
  });

  it('Cancel download from the menu stops the transfer', async () => {
    await longPressItem();
    await rt.fireEvent.press(button('Download…'));
    await rt.until(() => {
      expect(rt.screen.getByTestId('download-option-1080-avc1')).toBeTruthy();
    });
    await rt.fireEvent.press(rt.screen.getByTestId('download-option-1080-avc1'));
    await rt.until(() => {
      expect(rt.fileSystem.downloads).toHaveLength(1);
    });

    // Cancelled from the menu that stayed open: it falls back to the plain menu.
    await rt.fireEvent.press(rt.screen.getByTestId('download-action-cancel'));
    expect(rt.fileSystem.lastDownload().state).toBe('cancelled');
    expect(rt.screen.queryByTestId('download-action-progress')).toBeNull();
    expect(rt.screen.getByTestId('download-action-close')).toHaveTextContent('Cancel');
    expect(button('Download…')).toBeTruthy();
    expect(rt.inTab('index').queryByTestId(`download-badge-${POST_ID}`)).toBeNull();
  });

  it('the backdrop closes the menu', async () => {
    await longPressItem();
    await rt.fireEvent.press(rt.screen.getByTestId('download-sheet-backdrop'));
    expect(rt.screen.queryByTestId('download-sheet')).toBeNull();
    expect(rt.fileSystem.downloads).toHaveLength(0);
  });
});
