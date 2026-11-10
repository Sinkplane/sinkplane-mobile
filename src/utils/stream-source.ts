import type { VideoMetadata, VideoSource } from 'expo-video';

import { BROWSER_USER_AGENT, type VideoDelivery } from '@/shared';

type DeliveryVariant = VideoDelivery['groups'][number]['variants'][number];

const hasText = (value: string | null | undefined): value is string =>
  value !== null && value !== undefined && value !== '';

/** API data can omit a variant's URL despite the type. */
const hasUrl = (variant: DeliveryVariant): boolean => Boolean(variant.url);

const deniedReason = (variant: DeliveryVariant): string =>
  variant.meta?.common?.access?.deniedReason ?? '';

/** Enabled, has a URL, and the account may watch it. */
const isPlayable = (variant: DeliveryVariant): boolean =>
  variant.enabled !== false && hasUrl(variant) && deniedReason(variant) === '';

/** Highest playable variant, or the first one (the adaptive playlist) for live deliveries. */
function pickVariant(variants: DeliveryVariant[], live: boolean): DeliveryVariant | undefined {
  const playable = variants.filter(isPlayable);
  return live ? playable[0] : playable.at(-1);
}

/** The first group's first origin and that group's variants. */
function firstSource(
  delivery: VideoDelivery | null | undefined,
): { origin: string; variants: DeliveryVariant[] } | null {
  const group = delivery?.groups[0];
  const origin = group?.origins[0];
  return group && origin ? { origin: origin.url, variants: group.variants } : null;
}

/** `https://edge/guid///` → `https://edge/guid` (a linear scan rather than a backtracking regex). */
function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') {
    end--;
  }
  return url.slice(0, end);
}

/** Origin + variant path, with exactly one slash between them. */
function joinUrl(origin: string, path: string): string {
  const absolutePath = path.startsWith('/') ? path : `/${path}`;
  return `${trimTrailingSlashes(origin)}${absolutePath}`;
}

/**
 * Playable HLS URL from a `/api/v3/delivery/info` response: the first group's first origin plus
 * its highest playable variant (Floatplane orders variants by ascending quality; the TV app picks
 * the last one too). Variants that are disabled, URL-less or access-denied are skipped.
 *
 * With `live`, the first playable variant is used instead: live deliveries lead with the adaptive
 * ("live-abr") playlist, which switches quality itself (TV app parity).
 */
export function getStreamUrl(
  delivery: VideoDelivery | null | undefined,
  { live = false }: { live?: boolean } = {},
): string | null {
  const source = firstSource(delivery);
  if (!source) {
    return null;
  }
  const variant = pickVariant(source.variants, live);
  return variant ? joinUrl(source.origin, variant.url) : null;
}

/** Display metadata for the stream; callers may pass fields they don't have as `undefined`. */
interface StreamMetadata {
  title?: string | undefined;
  artist?: string | undefined;
  artwork?: string | undefined;
}

/** Drops the `undefined` fields (expo-video's metadata fields are optional, not undefined-able). */
function toVideoMetadata(metadata: StreamMetadata): VideoMetadata {
  const present = Object.entries(metadata).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  return Object.fromEntries(present);
}

/** Browser UA (Cloudflare) plus the session token as a bearer, like API calls. */
function requestHeaders(token: string | null | undefined): Record<string, string> {
  const headers: Record<string, string> = { 'User-Agent': BROWSER_USER_AGENT };
  if (hasText(token)) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/** expo-video source for a stream URL, authenticated the same way as API calls. */
export function buildVideoSource(
  url: string | null,
  token: string | null | undefined,
  metadata?: StreamMetadata,
): VideoSource {
  if (!hasText(url)) {
    return null;
  }
  return {
    uri: url,
    contentType: 'hls',
    headers: requestHeaders(token),
    ...(metadata && { metadata: toVideoMetadata(metadata) }),
  };
}
