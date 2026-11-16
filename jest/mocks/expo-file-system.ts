/**
 * In-memory stand-in for expo-file-system (registered with `jest.mock` in jest/setup.unit.ts and
 * __tests__/e2e/helpers/native-mocks.ts).
 *
 * `mockFileSystem.files` maps the URIs that exist to their text contents (and `sizes` to their
 * size); `mockFileSystem.downloads` records every download task the app created. A task's transfer
 * only ends when the test drives it: `progress(written, total)`, then `finish(size?)` (the file
 * appears) or `fail()`. `File.downloadFileAsync` (one-shot downloads) settles at once: it writes the
 * file, or rejects with `mockFileSystem.fileDownloadError` when set.
 */

type DownloadOutcome = { file: MockFile | null } | { error: Error };

export interface DownloadTaskOptions {
  headers?: Record<string, string>;
  deferBackgroundSessionCompletion?: boolean;
  onProgress?: (data: { bytesWritten: number | bigint; totalBytes: number | bigint }) => void;
}

const joinUri = (base: string, name: string): string =>
  `${base.endsWith('/') ? base.slice(0, -1) : base}/${name}`;

const uriOf = (parent: string | MockDirectory): string =>
  typeof parent === 'string' ? parent : parent.uri;

export class MockDirectory {
  readonly uri: string;

  constructor(parent: string | MockDirectory, name: string) {
    this.uri = joinUri(uriOf(parent), name);
  }

  create(): void {
    mockFileSystem.directories.add(this.uri);
  }

  /** The files directly inside this directory. */
  list(): MockFile[] {
    if (mockFileSystem.listError) {
      throw mockFileSystem.listError;
    }
    const prefix = `${this.uri}/`;
    return [...mockFileSystem.files.keys()]
      .filter((uri) => uri.startsWith(prefix) && !uri.slice(prefix.length).includes('/'))
      .map((uri) => new MockFile(this, uri.slice(prefix.length)));
  }
}

export class MockFile {
  readonly uri: string;

  constructor(parent: string | MockDirectory, name: string) {
    this.uri = joinUri(uriOf(parent), name);
  }

  get exists(): boolean {
    return mockFileSystem.files.has(this.uri);
  }

  get name(): string {
    return this.uri.slice(this.uri.lastIndexOf('/') + 1);
  }

  get size(): number {
    return mockFileSystem.sizes.get(this.uri) ?? 0;
  }

  delete(): void {
    if (!mockFileSystem.files.delete(this.uri)) {
      throw new Error(`No file at ${this.uri}`);
    }
    mockFileSystem.sizes.delete(this.uri);
  }

  textSync(): string {
    const text = mockFileSystem.files.get(this.uri);
    if (text === undefined) {
      throw new Error(`No file at ${this.uri}`);
    }
    return text;
  }

  writeSync(content: string): void {
    if (mockFileSystem.writeError) {
      throw mockFileSystem.writeError;
    }
    mockFileSystem.files.set(this.uri, content);
  }

  moveSync(destination: MockFile, options: { overwrite?: boolean } = {}): void {
    const text = this.textSync();
    if (destination.exists && options.overwrite !== true) {
      throw new Error(`A file already exists at ${destination.uri}`);
    }
    mockFileSystem.files.set(destination.uri, text);
    mockFileSystem.sizes.set(destination.uri, this.size);
    this.delete();
  }

  static downloadFileAsync(
    url: string,
    destination: MockFile,
    options: { idempotent?: boolean } = {},
  ): Promise<MockFile> {
    mockFileSystem.fileDownloads.push({ url, destination: destination.uri, options });
    const error = mockFileSystem.fileDownloadError;
    if (error) {
      return Promise.reject(error);
    }
    mockFileSystem.files.set(destination.uri, `downloaded:${url}`);
    return Promise.resolve(destination);
  }

  static createDownloadTask(
    url: string,
    destination: MockFile,
    options: DownloadTaskOptions = {},
  ): MockDownloadTask {
    const task = new MockDownloadTask(url, destination, options);
    mockFileSystem.downloads.push(task);
    return task;
  }
}

export class MockDownloadTask {
  state: 'idle' | 'active' | 'completed' | 'cancelled' | 'error' = 'idle';
  released = false;
  acknowledged = 0;
  private settle: ((outcome: DownloadOutcome) => void) | undefined;

  constructor(
    readonly url: string,
    readonly destination: MockFile,
    readonly options: DownloadTaskOptions,
  ) {}

  get headers(): Record<string, string> {
    return this.options.headers ?? {};
  }

  downloadAsync(): Promise<MockFile | null> {
    this.state = 'active';
    return new Promise<DownloadOutcome>((resolve) => {
      this.settle = resolve;
    }).then((outcome) => {
      if ('error' in outcome) {
        throw outcome.error;
      }
      return outcome.file;
    });
  }

  /** The native side reports bytes written (`total` -1: no Content-Length). */
  progress(bytesWritten: number | bigint, totalBytes: number | bigint): void {
    this.options.onProgress?.({ bytesWritten, totalBytes });
  }

  /** The transfer completes: the destination file exists (`sizeBytes` big). */
  finish(sizeBytes = 1000): void {
    mockFileSystem.files.set(this.destination.uri, `downloaded:${this.url}`);
    mockFileSystem.sizes.set(this.destination.uri, sizeBytes);
    this.state = 'completed';
    this.settle?.({ file: this.destination });
  }

  /** The transfer is paused (downloadAsync resolves null). */
  pause(): void {
    this.settle?.({ file: null });
  }

  fail(error = new Error('Network request failed')): void {
    this.state = 'error';
    this.settle?.({ error });
  }

  cancel(): void {
    if (this.state === 'active') {
      this.state = 'cancelled';
      this.settle?.({ error: new Error('Download was cancelled') });
    }
  }

  release(): void {
    this.released = true;
  }

  /** Records the iOS background-completion acknowledgment (`acknowledgeError` rejects it). */
  acknowledgeBackgroundCompletionAsync(): Promise<void> {
    this.acknowledged += 1;
    const error = mockFileSystem.acknowledgeError;
    return error ? Promise.reject(error) : Promise.resolve();
  }
}

export const mockFileSystem = {
  /** Existing files by URI → their text contents. */
  files: new Map<string, string>(),
  sizes: new Map<string, number>(),
  directories: new Set<string>(),
  downloads: [] as MockDownloadTask[],
  fileDownloads: [] as { url: string; destination: string; options: { idempotent?: boolean } }[],
  /** `File.downloadFileAsync` rejects with this while set. */
  fileDownloadError: null as Error | null,
  /** `writeSync` throws this while set. */
  writeError: null as Error | null,
  /** `Directory.list` throws this while set. */
  listError: null as Error | null,
  /** Download tasks' `acknowledgeBackgroundCompletionAsync` rejects with this while set. */
  acknowledgeError: null as Error | null,

  /** The most recently created download task. */
  lastDownload(): MockDownloadTask {
    const task = this.downloads.at(-1);
    if (!task) {
      throw new Error('No download task was created');
    }
    return task;
  },

  reset(): void {
    this.files.clear();
    this.sizes.clear();
    this.directories.clear();
    this.downloads = [];
    this.fileDownloads = [];
    this.fileDownloadError = null;
    this.writeError = null;
    this.listError = null;
    this.acknowledgeError = null;
  },
};

export const Paths = { cache: 'file:///cache/', document: 'file:///document/' };
export { MockDirectory as Directory, MockFile as File, MockDownloadTask as DownloadTask };
