import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';

import { DOUBLE_TAP_MS, usePlayerGestures, type SeekSide } from '@/hooks/use-player-gestures';

/** A press at `locationX` on a surface laid out `width` wide. */
function tapAt(locationX: number) {
  return { nativeEvent: { locationX } } as unknown as GestureResponderEvent;
}

const layout = (width: number) =>
  ({ nativeEvent: { layout: { width, height: 100 } } }) as unknown as LayoutChangeEvent;

interface Handlers {
  onSingleTap: jest.Mock;
  onDoubleTap: jest.Mock;
  onHoldStart: jest.Mock;
  onHoldEnd: jest.Mock;
}

async function renderGestures(width = 300) {
  const handlers: Handlers = {
    onSingleTap: jest.fn(),
    onDoubleTap: jest.fn((side) => side as SeekSide),
    onHoldStart: jest.fn(),
    onHoldEnd: jest.fn(),
  };
  const { result, unmount } = await renderHook(() => usePlayerGestures(handlers));
  await act(() => {
    result.current.onLayout(layout(width));
  });
  return { handlers, gestures: result, unmount };
}

describe('usePlayerGestures', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports a single tap only after the double-tap window passes', async () => {
    const { handlers, gestures } = await renderGestures();

    await act(() => {
      gestures.current.onPress(tapAt(80));
    });
    expect(handlers.onSingleTap).not.toHaveBeenCalled();

    await act(() => {
      jest.advanceTimersByTime(DOUBLE_TAP_MS);
    });
    expect(handlers.onSingleTap).toHaveBeenCalledTimes(1);
    expect(handlers.onDoubleTap).not.toHaveBeenCalled();
  });

  it('double-taps the left half as back and the right half as forward', async () => {
    const { handlers, gestures } = await renderGestures();

    await act(() => {
      gestures.current.onPress(tapAt(80)); // left of 150
      jest.advanceTimersByTime(DOUBLE_TAP_MS - 10);
      gestures.current.onPress(tapAt(120));
      jest.advanceTimersByTime(DOUBLE_TAP_MS - 10);
      gestures.current.onPress(tapAt(280)); // right half
      gestures.current.onPress(tapAt(299));
    });

    expect(handlers.onDoubleTap).toHaveBeenNthCalledWith(1, 'back');
    expect(handlers.onDoubleTap).toHaveBeenNthCalledWith(2, 'forward');
    // The double taps suppressed the single-tap toggle entirely.
    expect(handlers.onSingleTap).not.toHaveBeenCalled();
  });

  it('keeps double-tapping while the taps keep coming (repeat skips)', async () => {
    const { handlers, gestures } = await renderGestures();

    await act(() => {
      for (let i = 0; i < 4; i += 1) {
        gestures.current.onPress(tapAt(280));
        jest.advanceTimersByTime(150);
      }
      jest.advanceTimersByTime(DOUBLE_TAP_MS * 2);
    });

    expect(handlers.onDoubleTap).toHaveBeenCalledTimes(3); // taps 2, 3 and 4
    expect(handlers.onSingleTap).not.toHaveBeenCalled();
  });

  it('does not double-tap across halves or after the window', async () => {
    const { handlers, gestures } = await renderGestures();

    await act(() => {
      gestures.current.onPress(tapAt(80));
      gestures.current.onPress(tapAt(280)); // other half within the window
      jest.advanceTimersByTime(DOUBLE_TAP_MS);
    });

    expect(handlers.onDoubleTap).not.toHaveBeenCalled();
    // The first tap's pending single-tap was cancelled by the second press.
    expect(handlers.onSingleTap).toHaveBeenCalledTimes(1);

    await act(() => {
      jest.advanceTimersByTime(DOUBLE_TAP_MS * 2);
    });
    expect(handlers.onSingleTap).toHaveBeenCalledTimes(1);

    await act(() => {
      gestures.current.onPress(tapAt(80));
      jest.advanceTimersByTime(DOUBLE_TAP_MS + 1);
      gestures.current.onPress(tapAt(80));
      jest.advanceTimersByTime(DOUBLE_TAP_MS + 1);
    });
    expect(handlers.onDoubleTap).not.toHaveBeenCalled();
    expect(handlers.onSingleTap).toHaveBeenCalledTimes(3);
  });

  it('holds: long press starts, press out ends', async () => {
    const { handlers, gestures } = await renderGestures();

    await act(() => {
      gestures.current.onLongPress();
    });
    expect(handlers.onHoldStart).toHaveBeenCalledTimes(1);

    await act(() => {
      gestures.current.onLongPress();
    });
    expect(handlers.onHoldStart).toHaveBeenCalledTimes(2); // holding ref is idempotent here

    await act(() => {
      gestures.current.onPressOut();
    });
    expect(handlers.onHoldEnd).toHaveBeenCalledTimes(1);

    await act(() => {
      gestures.current.onPressOut();
    });
    expect(handlers.onHoldEnd).toHaveBeenCalledTimes(1); // not holding anymore
  });

  it('drops a pending single tap on unmount', async () => {
    const { handlers, gestures, unmount } = await renderGestures();

    await act(() => {
      gestures.current.onPress(tapAt(80));
    });
    await unmount();
    await act(() => {
      jest.advanceTimersByTime(DOUBLE_TAP_MS * 2);
    });
    expect(handlers.onSingleTap).not.toHaveBeenCalled();
  });
});
