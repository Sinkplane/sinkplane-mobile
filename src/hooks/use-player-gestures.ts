import { useEffect, useRef } from 'react';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';

/** Max gap between two taps on the same side for them to count as a double tap. */
export const DOUBLE_TAP_MS = 300;

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

/**
 * Tap / double-tap / press-and-hold recognition for the video surface, as Pressable props.
 * A single tap is reported only once the double-tap window has passed, so a double tap never
 * also toggles the controls.
 */
export function usePlayerGestures({ onSingleTap, onDoubleTap, onHoldStart, onHoldEnd }: PlayerGestureHandlers) {
  const width = useRef(0);
  const lastTap = useRef<{ time: number; side: SeekSide } | null>(null);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holding = useRef(false);

  const clearSingleTap = () => {
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    singleTapTimer.current = null;
  };

  useEffect(() => clearSingleTap, []);

  return {
    onLayout: (event: LayoutChangeEvent) => {
      width.current = event.nativeEvent.layout.width;
    },
    onPress: (event: GestureResponderEvent) => {
      const side: SeekSide = event.nativeEvent.locationX < width.current / 2 ? 'back' : 'forward';
      const now = Date.now();
      const previous = lastTap.current;
      lastTap.current = { time: now, side };
      clearSingleTap();

      if (previous && previous.side === side && now - previous.time < DOUBLE_TAP_MS) {
        onDoubleTap(side);
        return;
      }
      singleTapTimer.current = setTimeout(() => {
        singleTapTimer.current = null;
        lastTap.current = null;
        onSingleTap();
      }, DOUBLE_TAP_MS);
    },
    onLongPress: () => {
      holding.current = true;
      lastTap.current = null;
      onHoldStart();
    },
    onPressOut: () => {
      if (!holding.current) return;
      holding.current = false;
      onHoldEnd();
    },
  };
}
