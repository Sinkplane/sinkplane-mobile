import { useWindowDimensions } from 'react-native';

/** Android's tablet breakpoint (sw600dp): a window whose shorter side is at least this many dp. */
export const LARGE_SCREEN_MIN_DP = 600;

/** Narrowest grid column before the list drops a column. */
const MIN_COLUMN_WIDTH = 320;

/** List padding applies on both sides. */
const SIDES = 2;

interface WindowSize {
  width: number;
  height: number;
}

/** Tablets and unfolded foldables. Split-screen / Slide Over windows narrower than that count as phones. */
export function isLargeScreen({ width, height }: WindowSize): boolean {
  return Math.min(width, height) >= LARGE_SCREEN_MIN_DP;
}

/** How many columns of at least `MIN_COLUMN_WIDTH` fit in `width` after `padding` on each side. */
export interface GridColumns {
  numColumns: number;
  columnWidth: number;
}

export function gridColumns(width: number, padding: number, gap: number): GridColumns {
  const available = width - padding * SIDES;
  const numColumns = Math.max(1, Math.floor((available + gap) / (MIN_COLUMN_WIDTH + gap)));
  return { numColumns, columnWidth: (available - gap * (numColumns - 1)) / numColumns };
}

/**
 * Window-driven layout for the current screen, live across rotation, split screen and folding:
 * - `large`: tablet-sized window. The app rotates freely, and rotating a player page doesn't force
 *   fullscreen.
 * - `sideBySide`: a large window in landscape, where the player pages put the details beside the
 *   player instead of under it.
 */
export interface ScreenLayout {
  large: boolean;
  sideBySide: boolean;
}

export function useScreenLayout(): ScreenLayout {
  const window = useWindowDimensions();
  const large = isLargeScreen(window);
  return { large, sideBySide: large && window.width > window.height };
}

/** Horizontal padding and gap of the tab lists (videos, history, live). */
export const LIST_PADDING = 16;
export const LIST_GAP = 16;

/**
 * FlatList props for a tab list that becomes a grid on large screens: one column on phones (also
 * while a phone is sideways for a fullscreen video, which would otherwise remount the list under
 * the player), more on tablets and in landscape. FlatList can't change `numColumns` on the fly, so pass `listKey` as the
 * list's `key`: it remounts the list when the column count changes (rotation, split screen).
 */
export interface ListGrid {
  listKey: string;
  numColumns: number;
  columnWidth: number | undefined;
  columnWrapperStyle: { gap: number } | undefined;
}

export function useListGrid(): ListGrid {
  const window = useWindowDimensions();
  const { numColumns, columnWidth } = isLargeScreen(window)
    ? gridColumns(window.width, LIST_PADDING, LIST_GAP)
    : { numColumns: 1, columnWidth: 0 };
  return {
    listKey: `columns-${String(numColumns)}`,
    numColumns,
    columnWidth: numColumns > 1 ? columnWidth : undefined,
    columnWrapperStyle: numColumns > 1 ? { gap: LIST_GAP } : undefined,
  };
}
