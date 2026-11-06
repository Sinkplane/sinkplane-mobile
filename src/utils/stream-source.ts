import type { VideoSource } from 'expo-video';

import { BROWSER_USER_AGENT, type VideoDelivery } from '@/shared';

/**
 * Playable HLS URL from a `/api/v3/delivery/info` response: the first group's first origin plus
 * its highest playable variant (Floatplane orders variants by ascending quality; the TV app picks
 * the last one too). Variants that are disabled, URL-less or access-denied are skipped.
 *
 * With `live`, the first playable variant is used instead: live deliveries lead with the adaptive
 * ("live-abr") playlist, which switches quality itself (TV app parity).
 */
export function getStreamUrl(delivery: VideoDelivery | null | undefined, { live = false }: { live?: boolean } = {}): string | null {
  const group = delivery?.groups?.[0];
  const origin = group?.origins?.[0];
  if (!group || !origin) return null;

  const playable = group.variants.filter(v => v.enabled !== false && !!v.url && !v.meta?.common?.access?.deniedReason);
  const variant = live ? playable[0] : playable[playable.length - 1];
  if (!variant) return null;

  const base = origin.url.replace(/\/+$/, '');
  const path = variant.url.startsWith('/') ? variant.url : `/${variant.url}`;
  return `${base}${path}`;
}

/** expo-video source for a stream URL, authenticated the same way as API calls. */
export function buildVideoSource(
  url: string | null,
  token: string | null | undefined,
  metadata?: { title?: string; artist?: string; artwork?: string },
): VideoSource {
  if (!url) return null;
  const headers: Record<string, string> = { 'User-Agent': BROWSER_USER_AGENT };
  if (token) headers.Authorization = `Bearer ${token}`;
  return { uri: url, contentType: 'hls', headers, metadata };
}
