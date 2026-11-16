import { act, renderHook } from '@testing-library/react-native';

import { useSaveToPhotos } from '@/hooks/use-save-to-photos';
import type { DownloadedVideo } from '@/utils/download-library';
import { mockFileSystem } from '@test/mocks/expo-file-system';
import { mockMediaLibrary } from '@test/mocks/expo-media-library';

const FILE = 'file:///document/downloads/post-1.mp4';
const VIDEO: DownloadedVideo = {
  postId: 'post-1',
  title: 'Home Lab Tour',
  label: '1080p',
  sizeBytes: 1200,
  downloadedAt: '2026-11-15T10:00:00.000Z',
  hasThumbnail: false,
};

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockFileSystem.files.set(FILE, 'video');
});

afterEach(() => {
  errorSpy.mockRestore();
});

async function save() {
  const hook = await renderHook(() => useSaveToPhotos());
  expect(hook.result.current.state).toBe('idle');
  await act(() => {
    hook.result.current.save(VIDEO);
  });
  return hook;
}

describe('useSaveToPhotos', () => {
  it('saving, then saved: the downloaded file is copied into the library', async () => {
    mockMediaLibrary.autoSave = false;
    const { result } = await save();
    expect(result.current.state).toBe('saving');
    await act(async () => {
      mockMediaLibrary.finishSave();
      await Promise.resolve();
    });
    expect(result.current.state).toBe('saved');
    expect(mockMediaLibrary.saved).toEqual([FILE]);
    expect(mockFileSystem.files.has(FILE)).toBe(true);
  });

  it('denied access', async () => {
    mockMediaLibrary.granted = false;
    const { result } = await save();
    expect(result.current.state).toBe('denied');
    expect(mockMediaLibrary.saved).toEqual([]);
  });

  it('a failed save is shown and logged', async () => {
    mockMediaLibrary.saveError = new Error('Library full');
    const { result } = await save();
    expect(result.current.state).toBe('failed');
    expect(errorSpy).toHaveBeenCalledWith('[Downloads] Save to Photos failed', expect.any(Error));
  });

  it('a failed permission request counts as failed', async () => {
    mockMediaLibrary.permissionError = new Error('No activity');
    const { result } = await save();
    expect(result.current.state).toBe('failed');
  });
});
