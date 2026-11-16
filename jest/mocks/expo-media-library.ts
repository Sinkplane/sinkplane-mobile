/**
 * In-memory stand-in for expo-media-library (registered with `jest.mock` in jest/setup.unit.ts and
 * __tests__/e2e/helpers/native-mocks.ts).
 *
 * `mockMediaLibrary` holds what the permission prompt answers, the permission requests made, the
 * library's saved assets (file URIs, copied from expo-file-system's mock like the real copy), and an
 * optional error for the next save.
 */
import { mockFileSystem } from './expo-file-system';

interface PermissionRequest {
  writeOnly: boolean | undefined;
  granularPermissions: string[] | undefined;
}

export const mockMediaLibrary = {
  /** What a permission request answers. */
  granted: true,
  /** Make the permission request itself reject. */
  permissionError: null as Error | null,
  permissionRequests: [] as PermissionRequest[],
  /** Source URIs saved into the library, in order. */
  saved: [] as string[],
  /** The next `Asset.create` rejects with this (then clears it). */
  saveError: null as Error | null,
  /** Settles `Asset.create` immediately; set false and call `finishSave()` to hold it. */
  autoSave: true,
  pendingSave: null as (() => void) | null,

  finishSave(): void {
    const finish = this.pendingSave;
    this.pendingSave = null;
    finish?.();
  },

  reset(): void {
    this.granted = true;
    this.permissionError = null;
    this.permissionRequests = [];
    this.saved = [];
    this.saveError = null;
    this.autoSave = true;
    this.pendingSave = null;
  },
};

export function requestPermissionsAsync(
  writeOnly?: boolean,
  granularPermissions?: string[],
): Promise<{ granted: boolean; status: string; canAskAgain: boolean }> {
  mockMediaLibrary.permissionRequests.push({ writeOnly, granularPermissions });
  if (mockMediaLibrary.permissionError) {
    return Promise.reject(mockMediaLibrary.permissionError);
  }
  const { granted } = mockMediaLibrary;
  return Promise.resolve({ granted, status: granted ? 'granted' : 'denied', canAskAgain: false });
}

function save(filePath: string): { id: string } {
  const error = mockMediaLibrary.saveError;
  if (error) {
    mockMediaLibrary.saveError = null;
    throw error;
  }
  if (!mockFileSystem.files.has(filePath)) {
    throw new Error(`No file at ${filePath}`);
  }
  mockMediaLibrary.saved.push(filePath);
  return { id: `asset-${String(mockMediaLibrary.saved.length)}` };
}

export const Asset = {
  create(filePath: string): Promise<{ id: string }> {
    if (mockMediaLibrary.autoSave) {
      return Promise.resolve().then(() => save(filePath));
    }
    return new Promise<void>((resolve) => {
      mockMediaLibrary.pendingSave = resolve;
    }).then(() => save(filePath));
  },
};
