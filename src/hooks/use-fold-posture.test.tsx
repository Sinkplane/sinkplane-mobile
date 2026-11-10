import { act, renderHook } from '@testing-library/react-native';
import { mockFoldPosture } from '@test/mocks/fold-posture';
import { PHONE_WINDOW, setTestWindow } from '@test/window-size';

import { tabletopLayout, useFoldPosture, useTabletopLayout } from '@/hooks/use-fold-posture';

const PORTRAIT = { width: 400, height: 800 };
const LANDSCAPE = { width: 800, height: 400 };
const hinge = (y: number, height = 0) => ({ x: 0, y, width: 800, height });

describe('tabletopLayout', () => {
  it('is null unless the fold is half-opened', () => {
    expect(tabletopLayout(null, LANDSCAPE)).toBeNull();
    expect(
      tabletopLayout({ state: 'flat', orientation: 'horizontal', bounds: hinge(200) }, LANDSCAPE),
    ).toBeNull();
  });

  it('splits at the reported hinge bounds when it runs across the window (Android)', () => {
    expect(
      tabletopLayout(
        { state: 'halfOpened', orientation: 'horizontal', bounds: hinge(196, 8) },
        LANDSCAPE,
      ),
    ).toEqual({
      hingeTop: 196,
      hingeBottom: 204,
    });
  });

  it('ignores a vertical hinge (book posture) and a hinge outside the window', () => {
    expect(
      tabletopLayout(
        {
          state: 'halfOpened',
          orientation: 'vertical',
          bounds: { x: 200, y: 0, width: 0, height: 400 },
        },
        LANDSCAPE,
      ),
    ).toBeNull();
    expect(
      tabletopLayout(
        { state: 'halfOpened', orientation: 'horizontal', bounds: hinge(0) },
        LANDSCAPE,
      ),
    ).toBeNull();
    expect(
      tabletopLayout(
        { state: 'halfOpened', orientation: 'horizontal', bounds: hinge(400) },
        LANDSCAPE,
      ),
    ).toBeNull();
  });

  it('without hinge geometry (iOS) assumes it crosses the middle of a portrait window', () => {
    expect(tabletopLayout({ state: 'halfOpened', angle: 1.6 }, PORTRAIT)).toEqual({
      hingeTop: 400,
      hingeBottom: 400,
    });
    expect(tabletopLayout({ state: 'halfOpened', angle: 1.6 }, LANDSCAPE)).toBeNull();
  });
});

describe('useFoldPosture / useTabletopLayout', () => {
  afterEach(() => {
    setTestWindow(PHONE_WINDOW);
  });

  it('starts from the current posture and follows changes until unmount', async () => {
    mockFoldPosture.set({ state: 'flat' });
    const { result, unmount } = await renderHook(() => ({
      posture: useFoldPosture(),
      tabletop: useTabletopLayout(),
    }));
    expect(result.current.posture).toEqual({ state: 'flat' });
    expect(result.current.tabletop).toBeNull();

    // The test window is portrait (390×844), so an iOS-style half-open posture is tabletop.
    await act(() => {
      mockFoldPosture.set({ state: 'halfOpened' });
    });
    expect(result.current.tabletop).toEqual({ hingeTop: 422, hingeBottom: 422 });

    await unmount();
    expect(mockFoldPosture.listenerCount()).toBe(0);
  });
});
