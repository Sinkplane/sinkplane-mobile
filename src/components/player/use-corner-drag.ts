import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  PanResponder,
  type GestureResponderHandlers,
  type PanResponderGestureState,
} from 'react-native';

import {
  cornerOffset,
  DEFAULT_CORNER,
  nearestCorner,
  type Corner,
  type Point,
  type TileFrame,
} from '@/utils/mini-player-layout';

/** Movement before a touch on the tile counts as a drag rather than a tap. */
const DRAG_SLOP = 8;

const SPRING_BOUNCINESS = 4;

/** Where the tile sits and what it is laid out against. */
interface DragGeometry extends TileFrame {
  offset: Point;
}

export interface CornerDrag {
  corner: Corner;
  position: Animated.ValueXY;
  handlers: GestureResponderHandlers;
}

function springTo(position: Animated.ValueXY, target: Point): void {
  Animated.spring(position, {
    toValue: target,
    useNativeDriver: false,
    bounciness: SPRING_BOUNCINESS,
  }).start();
}

/** Pan handlers: the tile follows the finger, then springs into the corner it is released towards. */
function createDragHandlers(
  position: Animated.ValueXY,
  { offset, ...frame }: DragGeometry,
  setCorner: (corner: Corner) => void,
): GestureResponderHandlers {
  const release = ({ dx, dy, vx, vy }: PanResponderGestureState) => {
    const next = nearestCorner({ x: offset.x + dx, y: offset.y + dy }, { x: vx, y: vy }, frame);
    springTo(position, cornerOffset(next, frame));
    setCorner(next);
  };
  return PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, { dx, dy }) =>
      Math.abs(dx) > DRAG_SLOP || Math.abs(dy) > DRAG_SLOP,
    onPanResponderMove: (_event, { dx, dy }) => {
      position.setValue({ x: offset.x + dx, y: offset.y + dy });
    },
    onPanResponderRelease: (_event, gesture) => {
      release(gesture);
    },
    onPanResponderTerminate: (_event, gesture) => {
      release(gesture);
    },
  }).panHandlers;
}

/**
 * The tile's pan handlers, recreated only when the geometry's numbers change (the geometry objects
 * themselves are rebuilt on every render).
 */
function useDragHandlers(
  position: Animated.ValueXY,
  geometry: DragGeometry,
  setCorner: (corner: Corner) => void,
): GestureResponderHandlers {
  const { x, y } = geometry.offset;
  const { width: windowWidth, height: windowHeight } = geometry.window;
  const { width: tileWidth, height: tileHeight } = geometry.tile;
  const { top, bottom, left, right } = geometry.edges;

  return useMemo(
    () =>
      createDragHandlers(
        position,
        {
          offset: { x, y },
          window: { width: windowWidth, height: windowHeight },
          tile: { width: tileWidth, height: tileHeight },
          edges: { top, bottom, left, right },
        },
        setCorner,
      ),
    [
      position,
      x,
      y,
      windowWidth,
      windowHeight,
      tileWidth,
      tileHeight,
      top,
      bottom,
      left,
      right,
      setCorner,
    ],
  );
}

/**
 * Drag the tile anywhere; on release it springs into the corner it was dropped (or flung) towards.
 * Taps on the tile's buttons still go through: the responder only captures once the touch moves.
 */
export function useCornerDrag(frame: TileFrame): CornerDrag {
  const [corner, setCorner] = useState<Corner>(DEFAULT_CORNER);
  const offset = cornerOffset(corner, frame);
  const [position] = useState(() => new Animated.ValueXY(offset));
  const { x, y } = offset;

  // Follows corner changes and window resizes (unfolding a foldable, split screen).
  useEffect(() => {
    springTo(position, { x, y });
  }, [position, x, y]);

  const handlers = useDragHandlers(position, { ...frame, offset }, setCorner);
  return { corner, position, handlers };
}
