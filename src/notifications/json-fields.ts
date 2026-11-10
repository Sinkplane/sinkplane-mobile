/**
 * Reading off-the-wire JSON (API bodies, socket frames) without trusting its shape: every field is
 * `unknown` until one of these helpers has checked its type.
 */

export type JsonObject = Record<string, unknown>;

export const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null;

/** A nested object field, or an empty object when it is missing or not an object. */
export function objectField(object: JsonObject, key: string): JsonObject {
  const value = object[key];
  return isJsonObject(value) ? value : {};
}

/** An array field (its items still unchecked), or an empty array. */
export function arrayField(object: JsonObject, key: string): readonly unknown[] {
  const value: unknown = object[key];
  return Array.isArray(value) ? value : [];
}

export function stringField(object: JsonObject, key: string): string | undefined {
  const value = object[key];
  return typeof value === 'string' ? value : undefined;
}

export function numberField(object: JsonObject, key: string): number | undefined {
  const value = object[key];
  return typeof value === 'number' ? value : undefined;
}

export function booleanField(object: JsonObject, key: string): boolean | undefined {
  const value = object[key];
  return typeof value === 'boolean' ? value : undefined;
}
