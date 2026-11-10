import { cornerOffset, miniPlayerSize, nearestCorner } from '@/utils/mini-player-layout';

const WINDOW = { width: 400, height: 800 };
const TILE = { width: 184, height: 104 };
const EDGES = { top: 60, bottom: 100, left: 12, right: 12 };

describe('miniPlayerSize', () => {
  it('is a 16:9 tile about half the screen wide, capped on wide screens', () => {
    expect(miniPlayerSize(400)).toEqual({ width: 184, height: 104 });
    expect(miniPlayerSize(1200)).toEqual({ width: 280, height: 158 });
  });
});

describe('cornerOffset', () => {
  it('parks the tile inside the edges of each corner', () => {
    expect(cornerOffset('top-left', { window: WINDOW, tile: TILE, edges: EDGES })).toEqual({
      x: 12,
      y: 60,
    });
    expect(cornerOffset('top-right', { window: WINDOW, tile: TILE, edges: EDGES })).toEqual({
      x: 204,
      y: 60,
    });
    expect(cornerOffset('bottom-left', { window: WINDOW, tile: TILE, edges: EDGES })).toEqual({
      x: 12,
      y: 596,
    });
    expect(cornerOffset('bottom-right', { window: WINDOW, tile: TILE, edges: EDGES })).toEqual({
      x: 204,
      y: 596,
    });
  });
});

describe('nearestCorner', () => {
  const still = { x: 0, y: 0 };

  it('picks the quadrant the tile centre was dropped in', () => {
    expect(nearestCorner({ x: 10, y: 100 }, still, { window: WINDOW, tile: TILE })).toBe(
      'top-left',
    );
    expect(nearestCorner({ x: 250, y: 100 }, still, { window: WINDOW, tile: TILE })).toBe(
      'top-right',
    );
    expect(nearestCorner({ x: 10, y: 600 }, still, { window: WINDOW, tile: TILE })).toBe(
      'bottom-left',
    );
    expect(nearestCorner({ x: 250, y: 600 }, still, { window: WINDOW, tile: TILE })).toBe(
      'bottom-right',
    );
  });

  it('follows a fling past the middle', () => {
    expect(nearestCorner({ x: 204, y: 60 }, { x: 0, y: 3 }, { window: WINDOW, tile: TILE })).toBe(
      'bottom-right',
    );
    expect(nearestCorner({ x: 204, y: 60 }, { x: -2, y: 0 }, { window: WINDOW, tile: TILE })).toBe(
      'top-left',
    );
  });
});
