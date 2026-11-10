/**
 * In-memory stand-in for expo-secure-store (mapped in jest.config.base.js).
 * `items` is exported so tests can seed and inspect what the app persisted.
 */
export const items = new Map<string, string>();

export const getItemAsync = jest.fn((key: string): Promise<string | null> =>
  Promise.resolve(items.get(key) ?? null),
);

export const setItemAsync = jest.fn((key: string, value: string): Promise<void> => {
  items.set(key, value);
  return Promise.resolve();
});

export const deleteItemAsync = jest.fn((key: string): Promise<void> => {
  items.delete(key);
  return Promise.resolve();
});

// Keychain accessibility constants (values as in the native module; the mock ignores them).
export const AFTER_FIRST_UNLOCK = 0;
export const WHEN_UNLOCKED = 5;
