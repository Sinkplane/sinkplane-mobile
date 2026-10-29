/** Seconds → `M:SS` or `H:MM:SS`. */
export function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/** 1234 → `1.2K`, 3400000 → `3.4M`. */
export function formatCount(count: number) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

const UNITS: [string, number][] = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
];

/** ISO date → `3 days ago`, `1 hour ago`, … (hand-rolled: Hermes' Intl lacks RelativeTimeFormat). */
export function formatRelativeDate(iso: string | null, now = Date.now()) {
  if (!iso) return '';
  const elapsed = (now - new Date(iso).getTime()) / 1000;
  if (Number.isNaN(elapsed)) return '';

  for (const [unit, size] of UNITS) {
    const value = Math.floor(elapsed / size);
    if (value >= 1) return `${value} ${unit}${value === 1 ? '' : 's'} ago`;
  }
  return 'just now';
}
