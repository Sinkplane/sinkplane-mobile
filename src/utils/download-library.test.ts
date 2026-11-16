import { mockFileSystem } from '@test/mocks/expo-file-system';
import {
  deleteDownloadFiles,
  downloadedThumbnailUri,
  downloadedVideoUri,
  partialFileFor,
  readLibrary,
  thumbnailFileFor,
  videoFileFor,
  writeLibrary,
  type DownloadedVideo,
} from '@/utils/download-library';

const DIR = 'file:///document/downloads';
const INDEX = `${DIR}/index.json`;

const VIDEO: DownloadedVideo = {
  postId: 'post-1',
  title: 'Home Lab Tour',
  channel: 'LTT',
  label: '1080p',
  sizeBytes: 1200,
  durationSeconds: 600,
  downloadedAt: '2026-11-15T10:00:00.000Z',
  hasThumbnail: true,
};

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('file locations', () => {
  it('keeps every file of a post in the documents downloads directory', () => {
    expect(videoFileFor('post-1').uri).toBe(`${DIR}/post-1.mp4`);
    expect(partialFileFor('post-1').uri).toBe(`${DIR}/post-1.mp4.part`);
    expect(thumbnailFileFor('post-1').uri).toBe(`${DIR}/post-1.jpg`);
    expect(mockFileSystem.directories).toContain(DIR);
  });

  it('never lets a post id leave the directory', () => {
    expect(videoFileFor('../../etc/x y').uri).toBe(`${DIR}/______etc_x_y.mp4`);
    expect(videoFileFor('Ab_9-z').uri).toBe(`${DIR}/Ab_9-z.mp4`);
  });

  it('gives the player and the library the video URI, and the thumbnail when kept', () => {
    expect(downloadedVideoUri(VIDEO)).toBe(`${DIR}/post-1.mp4`);
    expect(downloadedThumbnailUri(VIDEO)).toBe(`${DIR}/post-1.jpg`);
    expect(downloadedThumbnailUri({ ...VIDEO, hasThumbnail: false })).toBeUndefined();
  });
});

describe('readLibrary / writeLibrary', () => {
  it('reads nothing before anything was written', () => {
    expect(readLibrary()).toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('round-trips the index', () => {
    mockFileSystem.files.set(`${DIR}/post-1.mp4`, 'video');
    writeLibrary([VIDEO]);
    expect(JSON.parse(mockFileSystem.files.get(INDEX) ?? '')).toEqual([VIDEO]);
    expect(readLibrary()).toEqual([VIDEO]);
  });

  it('skips entries whose video file is gone', () => {
    mockFileSystem.files.set(`${DIR}/post-2.mp4`, 'video');
    writeLibrary([VIDEO, { ...VIDEO, postId: 'post-2' }]);
    expect(readLibrary().map((video) => video.postId)).toEqual(['post-2']);
  });

  it.each([
    ['not an array', '{"postId":"post-1"}'],
    ['a non-object entry', '["post-1", null]'],
    ['no post id', JSON.stringify([{ ...VIDEO, postId: 1 }])],
    ['no title', JSON.stringify([{ ...VIDEO, title: undefined }])],
    ['no label', JSON.stringify([{ ...VIDEO, label: null }])],
    ['a non-numeric size', JSON.stringify([{ ...VIDEO, sizeBytes: '1200' }])],
    [
      'an infinite size',
      '[{"postId":"post-1","title":"t","label":"l","sizeBytes":1e999,"downloadedAt":"d"}]',
    ],
    ['no date', JSON.stringify([{ ...VIDEO, downloadedAt: 5 }])],
  ])('ignores %s', (_case, text) => {
    mockFileSystem.files.set(`${DIR}/post-1.mp4`, 'video');
    mockFileSystem.files.set(INDEX, text);
    expect(readLibrary()).toEqual([]);
  });

  it('a corrupt index reads empty and is logged', () => {
    mockFileSystem.files.set(INDEX, '{not json');
    expect(readLibrary()).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      '[Downloads] Could not read the downloads index',
      expect.any(SyntaxError),
    );
  });

  it('a failed write is logged, not thrown', () => {
    mockFileSystem.writeError = new Error('Disk full');
    expect(() => {
      writeLibrary([VIDEO]);
    }).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      '[Downloads] Could not write the downloads index',
      mockFileSystem.writeError,
    );
  });
});

describe('deleteDownloadFiles', () => {
  it("removes the post's video, thumbnail and half-written transfer, nothing else", () => {
    for (const name of ['post-1.mp4', 'post-1.jpg', 'post-1.mp4.part', 'post-2.mp4']) {
      mockFileSystem.files.set(`${DIR}/${name}`, 'x');
    }
    deleteDownloadFiles('post-1');
    expect([...mockFileSystem.files.keys()]).toEqual([`${DIR}/post-2.mp4`]);
  });

  it('tolerates missing files', () => {
    expect(() => {
      deleteDownloadFiles('post-1');
    }).not.toThrow();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs a file that cannot be deleted and still deletes the others', () => {
    mockFileSystem.files.set(`${DIR}/post-1.mp4`, 'x');
    mockFileSystem.files.set(`${DIR}/post-1.jpg`, 'x');
    const remove = jest.spyOn(Map.prototype, 'delete').mockImplementationOnce(() => {
      throw new Error('Busy');
    });
    deleteDownloadFiles('post-1');
    remove.mockRestore();
    expect(errorSpy).toHaveBeenCalledWith(
      '[Downloads] Could not delete a downloaded file',
      expect.any(Error),
    );
    expect(mockFileSystem.files.has(`${DIR}/post-1.jpg`)).toBe(false);
  });
});
