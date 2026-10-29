/**
 * In-memory stand-in for expo-secure-store (mapped in jest.config.base.js).
 * `items` is exported so tests can seed and inspect what the app persisted.
 */
export const items = new Map<string, string>();

export const getItemAsync = jest.fn(async (key: string): Promise<string | null> => items.get(key) ?? null);

export const setItemAsync = jest.fn(async (key: string, value: string): Promise<void> => {
  items.set(key, value);
});

export const deleteItemAsync = jest.fn(async (key: string): Promise<void> => {
  items.delete(key);
});
