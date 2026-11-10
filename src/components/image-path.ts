/**
 * An image resource as the Floatplane API may actually send it. The shared types declare most
 * images as present, but the API omits some (creator icons, offline cards, thumbnails, avatars).
 */
export interface ApiImage {
  readonly path?: string | null;
}

/** The image's path, or `undefined` when the image or its path is missing or empty. */
export function imagePath(image: ApiImage | null | undefined): string | undefined {
  const path = image?.path ?? '';
  return path === '' ? undefined : path;
}
