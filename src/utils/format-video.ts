const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const SECONDS_PER_HOUR = MINUTES_PER_HOUR * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = HOURS_PER_DAY * SECONDS_PER_HOUR;
const DAYS_PER_WEEK = 7;
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;
const MS_PER_SECOND = 1000;

const THOUSAND = 1_000;
const MILLION = 1_000_000;

const HEX_RADIX = 16;
const DECIMAL_RADIX = 10;
/** Length of the `#x` prefix of a hex character reference. */
const HEX_PREFIX_LENGTH = 2;
/** Character references below tab (control characters, incl. the link markers) stay undecoded. */
const FIRST_DECODED_CODE_POINT = 0x09;
const MAX_CODE_POINT = 0x10ffff;
/** Minutes and seconds are always shown with two digits. */
const CLOCK_FIELD_WIDTH = 2;

const pad = (n: number): string => n.toString().padStart(CLOCK_FIELD_WIDTH, '0');

/** Seconds → `M:SS` or `H:MM:SS`. */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const secs = Math.floor(seconds % SECONDS_PER_MINUTE);

  return hours > 0
    ? `${hours.toString()}:${pad(minutes)}:${pad(secs)}`
    : `${minutes.toString()}:${pad(secs)}`;
}

/** 1234 → `1.2K`, 3400000 → `3.4M`. */
export function formatCount(count: number): string {
  if (count >= MILLION) {
    return `${(count / MILLION).toFixed(1)}M`;
  }
  if (count >= THOUSAND) {
    return `${(count / THOUSAND).toFixed(1)}K`;
  }
  return count.toString();
}

const ENTITIES: Partial<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** `#169` / `#x1F383` → the code point (`NaN` when malformed). */
function codePoint(code: string): number {
  return code[1]?.toLowerCase() === 'x'
    ? parseInt(code.slice(HEX_PREFIX_LENGTH), HEX_RADIX)
    : parseInt(code.slice(1), DECIMAL_RADIX);
}

/** `&amp;` / `&#169;` / `&#x1F383;` → the character, or the entity unchanged when unknown. */
function decodeEntity(entity: string, code: string): string {
  if (!code.startsWith('#')) {
    return ENTITIES[code.toLowerCase()] ?? entity;
  }
  const point = codePoint(code);
  return point >= FIRST_DECODED_CODE_POINT && point <= MAX_CODE_POINT
    ? String.fromCodePoint(point)
    : entity;
}

const isBlank = (char: string | undefined): boolean => char === ' ' || char === '\t';

/** Drops the spaces / tabs at the end of a line. */
function trimLineEnd(line: string): string {
  let end = line.length;
  while (end > 0 && isBlank(line[end - 1])) {
    end--;
  }
  return line.slice(0, end);
}

/**
 * Replaces every `<…>` tag with `tagText(tag)` (what `/<[^>]*>/g` does, as a linear scan: that
 * regex backtracks quadratically on text with many unclosed `<`).
 */
function replaceTags(html: string, tagText: (tag: string) => string): string {
  let text = '';
  let index = 0;
  for (;;) {
    const open = html.indexOf('<', index);
    const close = open === -1 ? -1 : html.indexOf('>', open);
    if (close === -1) {
      return text + html.slice(index);
    }
    text += html.slice(index, open) + tagText(html.slice(open, close + 1));
    index = close + 1;
  }
}

const decodeEntities = (text: string): string =>
  text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, decodeEntity);

function toText(html: string, tagText: (tag: string) => string): string {
  const withBreaks = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])>/gi, '\n');
  return decodeEntities(replaceTags(withBreaks, tagText))
    .split('\n')
    .map(trimLineEnd)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Post body HTML (`<p>`, `<br>`, links, entities) → plain text with paragraph breaks. */
export function htmlToText(html: string | null | undefined): string {
  if (html === null || html === undefined || html === '') {
    return '';
  }
  return toText(html, () => '');
}

/** A run of post body text; `href` is set when the run is a link's label. */
export interface TextSegment {
  readonly text: string;
  readonly href?: string | undefined;
}

/** Characters no post body contains (they are stripped first), marking where a link starts / ends. */
const LINK_START = '\u0001';
const LINK_END = '\u0002';
const OPENING_ANCHOR = /^<a\s/i;
const CLOSING_ANCHOR = /^<\/a\s*>$/i;
const HREF_ATTRIBUTE = /\shref\s*=\s*("[^"]+"|'[^']+'|[^\s"'>]+)/i;

function anchorHref(tag: string): string | undefined {
  const value = OPENING_ANCHOR.test(tag) ? HREF_ATTRIBUTE.exec(tag)?.[1] : undefined;
  return value === undefined ? undefined : decodeEntities(value.replace(/^["']|["']$/g, ''));
}

/** Tag replacer that marks each `<a href>` … `</a>` with the link markers, collecting the hrefs. */
function linkMarkers(hrefs: string[]): (tag: string) => string {
  let inLink = false;
  return (tag) => {
    if (inLink) {
      inLink = !CLOSING_ANCHOR.test(tag);
      return inLink ? '' : LINK_END;
    }
    const href = anchorHref(tag);
    if (href === undefined) {
      return '';
    }
    hrefs.push(href);
    inLink = true;
    return LINK_START;
  };
}

function splitLinks(text: string, hrefs: readonly string[]): TextSegment[] {
  const [lead = '', ...links] = text.split(LINK_START);
  const segments: TextSegment[] = [{ text: lead }];
  links.forEach((part, index) => {
    const [label = '', tail = ''] = part.split(LINK_END);
    segments.push({ text: label, href: hrefs[index] }, { text: tail });
  });
  return segments.filter((segment) => segment.text !== '');
}

/** Like {@link htmlToText}, but keeps the body's links as separate segments carrying their href. */
export function htmlToSegments(html: string | null | undefined): TextSegment[] {
  if (html === null || html === undefined || html === '') {
    return [];
  }
  const hrefs: string[] = [];
  const clean = html.split(LINK_START).join('').split(LINK_END).join('');
  return splitLinks(toText(clean, linkMarkers(hrefs)), hrefs);
}

const UNITS: [string, number][] = [
  ['year', SECONDS_PER_DAY * DAYS_PER_YEAR],
  ['month', SECONDS_PER_DAY * DAYS_PER_MONTH],
  ['week', SECONDS_PER_DAY * DAYS_PER_WEEK],
  ['day', SECONDS_PER_DAY],
  ['hour', SECONDS_PER_HOUR],
  ['minute', SECONDS_PER_MINUTE],
];

/** Elapsed seconds → `3 days ago`, … or `just now` under a minute. */
function describeElapsed(elapsed: number): string {
  for (const [unit, size] of UNITS) {
    const value = Math.floor(elapsed / size);
    if (value >= 1) {
      return `${value.toString()} ${unit}${value === 1 ? '' : 's'} ago`;
    }
  }
  return 'just now';
}

/** ISO date → `3 days ago`, `1 hour ago`, … (hand-rolled: Hermes' Intl lacks RelativeTimeFormat). */
export function formatRelativeDate(iso: string | null, now = Date.now()): string {
  if (iso === null || iso === '') {
    return '';
  }
  const elapsed = (now - new Date(iso).getTime()) / MS_PER_SECOND;
  return Number.isNaN(elapsed) ? '' : describeElapsed(elapsed);
}
