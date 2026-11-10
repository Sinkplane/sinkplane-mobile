import { useEffect, useRef } from 'react';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';

/** Max gap between two taps on the same side for them to count as a double tap. */
export const DOUBLE_TAP_MS = 300;

/** The surface splits into a left (`back`) and a right (`forward`) half. */
const HALVES = 2;

export type SeekSide = 'back' | 'forward';

interface PlayerGestureHandlers {
  /** A tap that was not followed by a second one (toggles the controls). */
  onSingleTap: () => void;
  /** Double tap on the left (`back`) or right (`forward`) half. Further quick taps repeat it. */
  onDoubleTap: (side: SeekSide) => void;
  /** Long press started (speed boost on). */
  onHoldStart: () => void;
  /** Finger lifted after a long press (speed boost off). */
  onHoldEnd: () => void;
}

/** Pressable props for the video surface. */
export interface PlayerGestureProps {
  onLayout: (event: LayoutChangeEvent) => void;
  onPress: (event: GestureResponderEvent) => void;
  onLongPress: () => void;
  onPressOut: () => void;
}

interface Tap {
  time: number;
  side: SeekSide;
}

const isDoubleTap = (previous: Tap | null, tap: Tap): boolean =>
  previous?.side === tap.side && tap.time - previous.time < DOUBLE_TAP_MS;

/** The pending single tap: reported once the double-tap window passes without a second tap. */
function useSingleTapTimer(): {
  schedule: (onElapsed: () => void) => void;
  clear: () => void;
} {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
    }
    timer.current = null;
  };

  useEffect(() => clear, []);

  const schedule = (onElapsed: () => void) => {
    timer.current = setTimeout(() => {
      timer.current = null;
      onElapsed();
    }, DOUBLE_TAP_MS);
  };

  return { schedule, clear };
}

const sideOf = (locationX: number, width: number): SeekSide =>
  locationX < width / HALVES ? 'back' : 'forward';

/** Press-and-hold: a long press starts it, lifting the finger ends it. */
function useHoldGesture({
  onHoldStart,
  onHoldEnd,
}: Pick<PlayerGestureHandlers, 'onHoldStart' | 'onHoldEnd'>): Pick<
  PlayerGestureProps,
  'onLongPress' | 'onPressOut'
> {
  const holding = useRef(false);
  return {
    onLongPress: () => {
      holding.current = true;
      onHoldStart();
    },
    onPressOut: () => {
      if (!holding.current) {
        return;
      }
      holding.current = false;
      onHoldEnd();
    },
  };
}

/**
 * Tap / double-tap / press-and-hold recognition for the video surface, as Pressable props.
 * A single tap is reported only once the double-tap window has passed, so a double tap never
 * also toggles the controls.
 */
export function usePlayerGestures({
  onSingleTap,
  onDoubleTap,
  onHoldStart,
  onHoldEnd,
}: PlayerGestureHandlers): PlayerGestureProps {
  const width = useRef(0);
  const lastTap = useRef<Tap | null>(null);
  const singleTap = useSingleTapTimer();
  const holdGesture = useHoldGesture({
    onHoldStart: () => {
      lastTap.current = null;
      onHoldStart();
    },
    onHoldEnd,
  });

  return {
    onLayout: (event) => {
      width.current = event.nativeEvent.layout.width;
    },
    onPress: (event) => {
      const side = sideOf(event.nativeEvent.locationX, width.current);
      const tap = { time: Date.now(), side };
      const previous = lastTap.current;
      lastTap.current = tap;
      singleTap.clear();

      if (isDoubleTap(previous, tap)) {
        onDoubleTap(side);
        return;
      }
      singleTap.schedule(() => {
        lastTap.current = null;
        onSingleTap();
      });
    },
    ...holdGesture,
  };
}
