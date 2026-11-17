import { Linking } from 'react-native';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';

import {
  DownloadSheets,
  downloadingLabel,
  downloadPercent,
} from '@/components/downloads/DownloadActionSheet';
import type { DownloadActions } from '@/components/downloads/use-download-actions';
import type { VideoDownloadState } from '@/hooks/use-video-download';
import type { DownloadedVideo } from '@/utils/download-library';
import type { DownloadOption } from '@/utils/download-options';
import type { DownloadTarget } from '@/utils/download-target';
import { mockFileSystem } from '@test/mocks/expo-file-system';
import { mockMediaLibrary } from '@test/mocks/expo-media-library';

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const TARGET: DownloadTarget = {
  postId: 'post-1',
  title: 'Home Lab Tour',
  attachmentId: 'guid-1',
};

const VIDEO: DownloadedVideo = {
  postId: 'post-1',
  title: 'Home Lab Tour',
  label: '1080p',
  sizeBytes: 1.5 * 1024 ** 3,
  downloadedAt: '2026-11-15T10:00:00.000Z',
  hasThumbnail: false,
};
const VIDEO_URI = 'file:///document/downloads/post-1.mp4';

const OPTION: DownloadOption = {
  id: '720-avc1',
  label: '720p',
  url: 'https://edge.test/720.mp4',
  sizeBytes: 1000,
  estimated: false,
};

function makeActions(
  state: VideoDownloadState,
  overrides: Partial<DownloadActions> = {},
): DownloadActions {
  return {
    target: TARGET,
    download: {
      state,
      start: jest.fn(),
      cancel: jest.fn(),
      dismiss: jest.fn(),
      remove: jest.fn(),
    },
    options: { options: [OPTION], isLoading: false, isError: false, refetch: jest.fn() },
    sheet: 'menu',
    openMenu: jest.fn(),
    chooseQuality: jest.fn(),
    close: jest.fn(),
    select: jest.fn(),
    ...overrides,
  };
}

async function renderSheets(actions: DownloadActions) {
  await render(<DownloadSheets actions={actions} />);
  return actions;
}

const row = (name: string) => screen.getByRole('button', { name });
const DOWNLOADED: VideoDownloadState = { status: 'downloaded', video: VIDEO };

beforeEach(() => {
  mockRouter.push.mockReset();
});

describe('downloadPercent', () => {
  it.each([
    [0, '0%'],
    [0.005, '0%'],
    [0.429, '42%'],
    [0.999, '99%'],
    [1, '100%'],
  ])('%s is %s', (progress, text) => {
    expect(downloadPercent(progress)).toBe(text);
  });
});

describe('downloadingLabel', () => {
  it.each([
    [null, 'Downloading…'],
    [0, 'Downloading 0%'],
    [0.429, 'Downloading 42%'],
    [1, 'Downloading 100%'],
  ])('%s reads "%s"', (progress, label) => {
    expect(downloadingLabel(progress)).toBe(label);
  });
});

describe('DownloadSheets', () => {
  it('renders nothing without a video to act on', async () => {
    await renderSheets(makeActions({ status: 'idle' }, { target: undefined }));
    expect(screen.queryByTestId('download-sheet')).toBeNull();
  });

  it('is hidden while no sheet is open', async () => {
    await renderSheets(makeActions({ status: 'idle' }, { sheet: 'none' }));
    expect(screen.queryByTestId('download-sheet')).toBeNull();
  });

  it('idle: titles the menu and offers Download…, which opens the qualities', async () => {
    const actions = await renderSheets(makeActions({ status: 'idle' }));
    expect(screen.getByTestId('download-actions-title')).toHaveTextContent('Home Lab Tour');
    expect(screen.queryByTestId('download-actions-note')).toBeNull();
    await fireEvent.press(row('Download…'));
    expect(actions.chooseQuality).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
  });

  it('failed: says so and offers Download… again', async () => {
    await renderSheets(makeActions({ status: 'failed', label: '720p' }));
    expect(screen.getByTestId('download-actions-note')).toHaveTextContent(
      "Couldn't download 720p. Try again.",
    );
    expect(row('Download…')).toBeEnabled();
  });

  it('downloading: shows the progress (not pressable) and cancels', async () => {
    const actions = await renderSheets(
      makeActions({ status: 'downloading', label: '720p', progress: 0.25 }),
    );
    expect(row('Downloading 25%')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Download…' })).toBeNull();
    await fireEvent.press(row('Cancel download'));
    expect(actions.download.cancel).toHaveBeenCalledTimes(1);
    expect(actions.close).not.toHaveBeenCalled();
  });

  it('downloaded: describes the file and plays it from the downloads', async () => {
    const actions = await renderSheets(makeActions(DOWNLOADED));
    expect(screen.getByTestId('download-actions-note')).toHaveTextContent(
      '1080p · 1.5 GB · Available offline',
    );
    await fireEvent.press(row('Play'));
    expect(actions.close).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/video/[id]',
      params: { id: 'post-1' },
    });
  });

  it('downloaded: Delete download removes it and closes the menu', async () => {
    const actions = await renderSheets(makeActions(DOWNLOADED));
    await fireEvent.press(row('Delete download'));
    expect(actions.download.remove).toHaveBeenCalledTimes(1);
    expect(actions.close).toHaveBeenCalledTimes(1);
  });

  it('downloaded: Save to Photos copies the file, then reads as saved', async () => {
    mockFileSystem.files.set(VIDEO_URI, 'video');
    mockMediaLibrary.autoSave = false;
    await renderSheets(makeActions(DOWNLOADED));
    await fireEvent.press(row('Save to Photos'));
    await act(() => Promise.resolve());
    expect(row('Saving to Photos…')).toBeDisabled();

    await act(async () => {
      mockMediaLibrary.finishSave();
      await Promise.resolve();
    });
    expect(row('Saved to Photos')).toBeDisabled();
    expect(mockMediaLibrary.saved).toEqual([VIDEO_URI]);
    expect(screen.queryByTestId('download-save-status')).toBeNull();
  });

  it('downloaded: denied Photos access explains and links to Settings', async () => {
    mockMediaLibrary.granted = false;
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await renderSheets(makeActions(DOWNLOADED));
    await fireEvent.press(row('Save to Photos'));
    expect(await screen.findByTestId('download-save-status')).toHaveTextContent(
      'Allow access to Photos to save videos. Open Settings',
    );
    expect(row('Save to Photos')).toBeEnabled();
    await fireEvent.press(screen.getByRole('link', { name: 'Open Settings' }));
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('downloaded: a failed save says so and can be retried', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockMediaLibrary.saveError = new Error('disk full');
    mockFileSystem.files.set(VIDEO_URI, 'video');
    await renderSheets(makeActions(DOWNLOADED));
    await fireEvent.press(row('Save to Photos'));
    expect(await screen.findByTestId('download-save-status')).toHaveTextContent(
      "Couldn't save to Photos. Try again.",
    );
    expect(screen.queryByRole('link', { name: 'Open Settings' })).toBeNull();

    await fireEvent.press(row('Save to Photos'));
    expect(await screen.findByRole('button', { name: 'Saved to Photos' })).toBeTruthy();
    errorSpy.mockRestore();
  });

  it('Cancel and the backdrop close the menu', async () => {
    const actions = await renderSheets(makeActions({ status: 'idle' }));
    // userEvent runs the full pressIn → pressOut cycle, so the pressed row style is exercised too.
    await userEvent.setup().press(row('Cancel'));
    await fireEvent.press(screen.getByTestId('download-sheet-backdrop'));
    expect(actions.close).toHaveBeenCalledTimes(2);
  });

  it('the bottom row reads "Done" while downloading (it only hides the menu), else "Cancel"', async () => {
    const actions = await renderSheets(
      makeActions({ status: 'downloading', label: '720p', progress: 0.25 }),
    );
    expect(screen.getByTestId('download-action-close')).toHaveTextContent('Done', { exact: true });
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    await fireEvent.press(screen.getByTestId('download-action-close'));
    expect(actions.close).toHaveBeenCalledTimes(1);
    expect(actions.download.cancel).not.toHaveBeenCalled();
  });

  it.each<[string, VideoDownloadState]>([
    ['idle', { status: 'idle' }],
    ['failed', { status: 'failed', label: '720p' }],
    ['downloaded', DOWNLOADED],
  ])('the bottom row reads "Cancel" when %s', async (_name, state) => {
    await renderSheets(makeActions(state));
    expect(screen.getByTestId('download-action-close')).toHaveTextContent('Cancel', {
      exact: true,
    });
  });

  it('the quality sheet lists the qualities and hands the choice over', async () => {
    const actions = await renderSheets(makeActions({ status: 'idle' }, { sheet: 'quality' }));
    expect(screen.getByText('Download quality')).toBeTruthy();
    expect(screen.queryByTestId('download-actions-title')).toBeNull();
    await fireEvent.press(screen.getByTestId('download-option-720-avc1'));
    expect(actions.select).toHaveBeenCalledWith(OPTION);
  });
});
