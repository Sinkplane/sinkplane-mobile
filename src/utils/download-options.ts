import type { VideoDelivery } from '@/shared';
import { isPlayable, joinUrl, type DeliveryVariant } from '@/utils/stream-source';

/** One downloadable quality of a video: a direct MP4 file. */
export interface DownloadOption {
  /** Unique within the delivery (the variant's programmatic name, else its URL). */
  readonly id: string;
  /** Display label, e.g. `1080p` or `4K`. */
  readonly label: string;
  /** Absolute, signed file URL. */
  readonly url: string;
  /** File size in bytes, when the API reports it or the bitrates allow an estimate. */
  readonly sizeBytes: number | undefined;
  /** `sizeBytes` is derived from the average bitrates rather than reported. */
  readonly estimated: boolean;
}

type DeliveryGroup = VideoDelivery['groups'][number];

/** Fields of a `scenario=download` variant the shared type does not model. */
interface DownloadVariantExtras {
  readonly hidden?: boolean;
  readonly origins?: readonly { readonly url: string }[];
  readonly meta?: {
    readonly common?: { readonly size?: number };
    readonly video?: { readonly bitrate?: { readonly average?: number } };
    readonly audio?: { readonly bitrate?: { readonly average?: number } };
  };
}

/** Where relative URLs resolve when neither the variant nor its group names an origin. */
const DEFAULT_ORIGIN = 'https://www.floatplane.com';
const BITS_PER_BYTE = 8;

const extras = (variant: DeliveryVariant): DownloadVariantExtras =>
  variant as DownloadVariantExtras;

const isAbsolute = (url: string): boolean => /^https?:\/\//i.test(url);

type Origins = readonly { readonly url: string }[] | undefined;
type StreamMeta = { readonly bitrate?: { readonly average?: number } } | undefined;

const firstOrigin = (origins: Origins): string | undefined => origins?.[0]?.url;

/** The variant's own origin, else its group's, else floatplane.com (never another group's). */
const originFor = (variant: DeliveryVariant, group: DeliveryGroup): string =>
  firstOrigin(extras(variant).origins) ?? firstOrigin(group.origins) ?? DEFAULT_ORIGIN;

/** The variant's file URL: absolute URLs as-is, relative ones joined to `originFor`. */
function variantUrl(variant: DeliveryVariant, group: DeliveryGroup): string {
  return isAbsolute(variant.url) ? variant.url : joinUrl(originFor(variant, group), variant.url);
}

const averageBitrate = (stream: StreamMeta): number => stream?.bitrate?.average ?? 0;

/** Average video + audio bitrate, bits per second (0 when unknown). */
function totalBitrate(variant: DeliveryVariant): number {
  const meta = extras(variant).meta;
  return averageBitrate(meta?.video) + averageBitrate(meta?.audio);
}

/** Bytes for `durationSeconds` at the variant's average bitrate, if both are known. */
function estimateSize(variant: DeliveryVariant, durationSeconds: number | undefined) {
  const bitrate = totalBitrate(variant);
  const seconds = durationSeconds ?? 0;
  return bitrate > 0 && seconds > 0 ? Math.round((bitrate * seconds) / BITS_PER_BYTE) : undefined;
}

const reportedSize = (variant: DeliveryVariant): number | undefined =>
  extras(variant).meta?.common?.size;

const variantLabel = (variant: DeliveryVariant): string => variant.label ?? variant.name ?? 'Video';

function toOption(
  variant: DeliveryVariant,
  group: DeliveryGroup,
  durationSeconds: number | undefined,
): DownloadOption {
  const reported = reportedSize(variant);
  const sizeBytes = reported ?? estimateSize(variant, durationSeconds);
  return {
    id: variant.name ?? variant.url,
    label: variantLabel(variant),
    url: variantUrl(variant, group),
    sizeBytes,
    estimated: reported === undefined && sizeBytes !== undefined,
  };
}

const isDownloadable = (variant: DeliveryVariant): boolean =>
  isPlayable(variant) && extras(variant).hidden !== true;

/**
 * The qualities a `/api/v3/delivery/info?scenario=download` response offers, best first.
 * Floatplane lists variants by ascending quality; disabled, hidden, URL-less and access-denied
 * ones are left out. `durationSeconds` lets sizes the API leaves out be estimated from bitrates.
 */
export function getDownloadOptions(
  delivery: VideoDelivery | null | undefined,
  durationSeconds?: number,
): DownloadOption[] {
  const group = delivery?.groups[0];
  if (!group) {
    return [];
  }
  return group.variants
    .filter(isDownloadable)
    .map((variant) => toOption(variant, group, durationSeconds))
    .reverse();
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
const KILO = 1024;
/** One decimal below 10 units (`1.4 GB`), none above (`420 MB`). */
const DECIMAL_BELOW = 10;

/** `1536` → `1.5 KB`, `440401920` → `420 MB`. */
export function formatBytes(bytes: number): string {
  let value = Math.max(bytes, 0);
  let unit = 0;
  while (value >= KILO && unit < BYTE_UNITS.length - 1) {
    value /= KILO;
    unit++;
  }
  const digits = unit > 0 && value < DECIMAL_BELOW ? 1 : 0;
  return `${value.toFixed(digits)} ${BYTE_UNITS[unit] ?? 'B'}`;
}

/** Characters no file system (or the Android media store) accepts in a name. */
const UNSAFE_FILE_CHARS = new Set('/\\:*?"<>|');
const FIRST_PRINTABLE = 0x20;
const DELETE = 0x7f;
const MAX_TITLE_CHARS = 80;

function isUnsafe(char: string): boolean {
  const code = char.charCodeAt(0);
  return code < FIRST_PRINTABLE || code === DELETE || UNSAFE_FILE_CHARS.has(char);
}

const clean = (text: string): string =>
  Array.from(text, (char) => (isUnsafe(char) ? '-' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

/** `"Tech: News / Week 4"` + `1080p` → `Tech- News - Week 4 (1080p).mp4` (the gallery's file name). */
export function downloadFileName(title: string, label: string): string {
  const base = clean(title).slice(0, MAX_TITLE_CHARS).trim();
  return `${base === '' ? 'video' : base} (${clean(label)}).mp4`;
}
