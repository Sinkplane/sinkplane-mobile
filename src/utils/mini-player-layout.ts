/** Geometry for the floating mini player: a 16:9 tile snapped to one of the screen corners. */

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Distances the tile keeps from each screen edge (safe area + chrome such as the tab bar). */
export interface Edges {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export const DEFAULT_CORNER: Corner = 'top-right';

/** Gap between the tile and the safe area / tab bar. */
export const MINI_PLAYER_MARGIN = 12;

const WIDTH_FRACTION = 0.46;
const MAX_WIDTH = 280;

/** How far ahead a fling is projected when picking the corner it lands in (ms of travel). */
const FLING_PROJECTION_MS = 150;

/** About half the screen width on phones, capped on tablets / unfolded foldables. */
export function miniPlayerSize(windowWidth: number): Size {
  const width = Math.round(Math.min(windowWidth * WIDTH_FRACTION, MAX_WIDTH));
  return { width, height: Math.round((width * 9) / 16) };
}

/** Top-left position of the tile parked in `corner`. */
export function cornerOffset(corner: Corner, window: Size, tile: Size, edges: Edges): Point {
  const left = corner.endsWith('left');
  const top = corner.startsWith('top');
  return {
    x: left ? edges.left : window.width - edges.right - tile.width,
    y: top ? edges.top : window.height - edges.bottom - tile.height,
  };
}

/**
 * The corner a tile released at `position` (its top-left) should snap to: the quadrant its centre
 * lands in, after projecting a fling's velocity (px/ms, as PanResponder reports it) a little ahead.
 */
export function nearestCorner(position: Point, velocity: Point, window: Size, tile: Size): Corner {
  const centerX = position.x + tile.width / 2 + velocity.x * FLING_PROJECTION_MS;
  const centerY = position.y + tile.height / 2 + velocity.y * FLING_PROJECTION_MS;
  const vertical = centerY < window.height / 2 ? 'top' : 'bottom';
  const horizontal = centerX < window.width / 2 ? 'left' : 'right';
  return `${vertical}-${horizontal}`;
}
