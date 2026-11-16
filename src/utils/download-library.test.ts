import { mockFileSystem } from '@test/mocks/expo-file-system';
import {
  deleteAbandonedTransfers,
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
const TEMPORARY_INDEX = `${DIR}/index.json.tmp`;

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
    expect(partialFileFor('post-1', '7').uri).toBe(`${DIR}/post-1.7.part`);
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
    expect(writeLibrary([VIDEO])).toBe(true);
    expect(JSON.parse(mockFileSystem.files.get(INDEX) ?? '')).toEqual([VIDEO]);
    expect(readLibrary()).toEqual([VIDEO]);
  });

  it('replaces an older index through the temporary file, leaving no temporary file', () => {
    mockFileSystem.files.set(INDEX, '[]');
    expect(writeLibrary([VIDEO])).toBe(true);
    expect(JSON.parse(mockFileSystem.files.get(INDEX) ?? '')).toEqual([VIDEO]);
    expect(mockFileSystem.files.has(TEMPORARY_INDEX)).toBe(false);
  });

  it('reads the temporary index when the app stopped before the rename', () => {
    mockFileSystem.files.set(`${DIR}/post-1.mp4`, 'video');
    mockFileSystem.files.set(TEMPORARY_INDEX, JSON.stringify([VIDEO]));
    expect(readLibrary()).toEqual([VIDEO]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('prefers the index over a leftover temporary index', () => {
    mockFileSystem.files.set(`${DIR}/post-1.mp4`, 'video');
    mockFileSystem.files.set(`${DIR}/post-2.mp4`, 'video');
    mockFileSystem.files.set(INDEX, JSON.stringify([VIDEO]));
    mockFileSystem.files.set(TEMPORARY_INDEX, JSON.stringify([{ ...VIDEO, postId: 'post-2' }]));
    expect(readLibrary().map((video) => video.postId)).toEqual(['post-1']);
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
    expect(writeLibrary([VIDEO])).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      '[Downloads] Could not write the downloads index',
      mockFileSystem.writeError,
    );
  });

  describe('with only a recovered temporary index', () => {
    const A = VIDEO;
    const B = { ...VIDEO, postId: 'post-2' };

    beforeEach(() => {
      mockFileSystem.files.set(`${DIR}/post-1.mp4`, 'video');
      mockFileSystem.files.set(`${DIR}/post-2.mp4`, 'video');
      mockFileSystem.files.set(TEMPORARY_INDEX, JSON.stringify([A]));
    });

    it('promotes it to the index first, so a failed write keeps the only good copy', () => {
      mockFileSystem.writeError = new Error('Disk full');
      expect(writeLibrary([B])).toBe(false);
      expect(JSON.parse(mockFileSystem.files.get(INDEX) ?? '')).toEqual([A]);
      expect(mockFileSystem.files.has(TEMPORARY_INDEX)).toBe(false);
      mockFileSystem.writeError = null;
      expect(readLibrary()).toEqual([A]);
    });

    it('a successful write leaves the new index and no temporary file', () => {
      expect(writeLibrary([B])).toBe(true);
      expect(JSON.parse(mockFileSystem.files.get(INDEX) ?? '')).toEqual([B]);
      expect(mockFileSystem.files.has(TEMPORARY_INDEX)).toBe(false);
    });
  });

  it('a failed rename is logged and reports false', () => {
    mockFileSystem.files.set(INDEX, '[]');
    const remove = jest.spyOn(Map.prototype, 'delete').mockImplementationOnce(() => {
      throw new Error('Busy');
    });
    expect(writeLibrary([VIDEO])).toBe(false);
    remove.mockRestore();
    expect(errorSpy).toHaveBeenCalledWith(
      '[Downloads] Could not write the downloads index',
      expect.any(Error),
    );
  });
});

describe('deleteAbandonedTransfers', () => {
  it('deletes every .part file and leaves other files alone', () => {
    const names = ['post-1.3.part', 'post-2.9.part', 'post-1.mp4', 'post-1.jpg', 'index.json'];
    for (const name of names) {
      mockFileSystem.files.set(`${DIR}/${name}`, 'x');
    }
    deleteAbandonedTransfers();
    expect([...mockFileSystem.files.keys()]).toEqual(
      ['post-1.mp4', 'post-1.jpg', 'index.json'].map((name) => `${DIR}/${name}`),
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does nothing in an empty directory', () => {
    deleteAbandonedTransfers();
    expect(mockFileSystem.files.size).toBe(0);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs a failed listing instead of throwing', () => {
    mockFileSystem.listError = new Error('No access');
    expect(() => {
      deleteAbandonedTransfers();
    }).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      '[Downloads] Could not list the downloads directory',
      mockFileSystem.listError,
    );
  });

  it('logs a file that cannot be deleted and still deletes the others', () => {
    mockFileSystem.files.set(`${DIR}/post-1.1.part`, 'x');
    mockFileSystem.files.set(`${DIR}/post-2.2.part`, 'x');
    const remove = jest.spyOn(Map.prototype, 'delete').mockImplementationOnce(() => {
      throw new Error('Busy');
    });
    deleteAbandonedTransfers();
    remove.mockRestore();
    expect(errorSpy).toHaveBeenCalledWith(
      '[Downloads] Could not delete a downloaded file',
      expect.any(Error),
    );
    expect(mockFileSystem.files.has(`${DIR}/post-2.2.part`)).toBe(false);
  });
});

describe('deleteDownloadFiles', () => {
  it("removes the post's video and thumbnail, nothing else, and reports true", () => {
    for (const name of ['post-1.mp4', 'post-1.jpg', 'post-1.4.part', 'post-2.mp4']) {
      mockFileSystem.files.set(`${DIR}/${name}`, 'x');
    }
    expect(deleteDownloadFiles('post-1')).toBe(true);
    expect([...mockFileSystem.files.keys()]).toEqual([`${DIR}/post-1.4.part`, `${DIR}/post-2.mp4`]);
  });

  it('tolerates missing files', () => {
    expect(deleteDownloadFiles('post-1')).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('keeps the thumbnail and reports false when the video cannot be deleted', () => {
    mockFileSystem.files.set(`${DIR}/post-1.mp4`, 'x');
    mockFileSystem.files.set(`${DIR}/post-1.jpg`, 'x');
    const remove = jest.spyOn(Map.prototype, 'delete').mockImplementationOnce(() => {
      throw new Error('Busy');
    });
    expect(deleteDownloadFiles('post-1')).toBe(false);
    remove.mockRestore();
    expect(errorSpy).toHaveBeenCalledWith(
      '[Downloads] Could not delete a downloaded file',
      expect.any(Error),
    );
    expect(mockFileSystem.files.has(`${DIR}/post-1.jpg`)).toBe(true);
  });

  it('logs a thumbnail that cannot be deleted, but still reports true', () => {
    mockFileSystem.files.set(`${DIR}/post-1.jpg`, 'x');
    const remove = jest.spyOn(Map.prototype, 'delete').mockImplementationOnce(() => {
      throw new Error('Busy');
    });
    expect(deleteDownloadFiles('post-1')).toBe(true);
    remove.mockRestore();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
