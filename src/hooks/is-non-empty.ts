/** A present, non-empty string (e.g. a session token or an id; an empty one counts as missing). */
export function isNonEmpty(value: string | null | undefined): value is string {
  return value !== undefined && value !== null && value !== '';
}
