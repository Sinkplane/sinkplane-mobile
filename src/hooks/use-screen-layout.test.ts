import { act, renderHook } from '@testing-library/react-native';
import {
  PHONE_LANDSCAPE_WINDOW,
  PHONE_WINDOW,
  setTestWindow,
  TABLET_LANDSCAPE_WINDOW,
  TABLET_PORTRAIT_WINDOW,
} from '@test/window-size';

import {
  gridColumns,
  isLargeScreen,
  LARGE_SCREEN_MIN_DP,
  LIST_GAP,
  LIST_PADDING,
  useListGrid,
  useScreenLayout,
} from '@/hooks/use-screen-layout';

describe('isLargeScreen', () => {
  it('uses the sw600dp tablet breakpoint on the window’s shorter side', () => {
    expect(LARGE_SCREEN_MIN_DP).toBe(600);
    expect(isLargeScreen({ width: 599, height: 1000 })).toBe(false);
    expect(isLargeScreen({ width: 600, height: 1000 })).toBe(true);
    expect(isLargeScreen({ width: 1000, height: 599 })).toBe(false);
    expect(isLargeScreen({ width: 1000, height: 600 })).toBe(true);
  });

  it('a landscape phone is not a tablet', () => {
    expect(isLargeScreen({ width: 844, height: 390 })).toBe(false);
    expect(isLargeScreen({ width: 390, height: 844 })).toBe(false);
  });

  it('tablets are large in both orientations; a portrait unfolded foldable counts', () => {
    expect(isLargeScreen({ width: 1024, height: 1366 })).toBe(true);
    expect(isLargeScreen({ width: 1366, height: 1024 })).toBe(true);
    expect(isLargeScreen({ width: 750, height: 1334 })).toBe(true);
  });
});

describe('gridColumns', () => {
  const cases: ReadonlyArray<[number, number, number]> = [
    // [window width, expected numColumns, expected columnWidth]
    [390, 1, 358], // phone: everything after 2×16 padding
    [750, 2, 351], // unfolded foldable portrait
    [800, 2, 376],
    [1024, 3, 320], // tablet portrait
    [1280, 3, 405.3333333333333],
    [1366, 4, 321.5], // tablet landscape
  ];

  it.each(cases)('a %i-wide window lays out %i columns of %i dp', (width, numColumns, columnWidth) => {
    expect(gridColumns(width, LIST_PADDING, LIST_GAP)).toEqual({ numColumns, columnWidth });
    expect(numColumns).toBeGreaterThan(0);
    // Every column is at least the minimum width, or the list is single-column.
    if (numColumns > 1) expect(columnWidth).toBeGreaterThanOrEqual(320);
  });

  it('keeps one full-width column when even a single minimum-width column barely fits', () => {
    // padding*2 + 320 exactly: one column, exactly the minimum width.
    expect(gridColumns(352, LIST_PADDING, LIST_GAP)).toEqual({ numColumns: 1, columnWidth: 320 });
    // One dp less and the column is narrower than the minimum, but still one column.
    expect(gridColumns(300, LIST_PADDING, LIST_GAP)).toEqual({ numColumns: 1, columnWidth: 268 });
  });
});

describe('useScreenLayout', () => {
  // The global setup (jest/setup.unit.ts) resets the window before each test; no afterEach reset
  // is needed, and one would fire while this test's hook is still mounted.
  const at = (size: { width: number; height: number }) => () => {
    setTestWindow(size);
    return useScreenLayout();
  };

  it('reports a phone: not large, never side-by-side', async () => {
    const { result } = await renderHook(at(PHONE_WINDOW));
    expect(result.current).toEqual({ large: false, sideBySide: false });
  });

  it('a portrait tablet is large but not side-by-side', async () => {
    const { result } = await renderHook(at(TABLET_PORTRAIT_WINDOW));
    expect(result.current).toEqual({ large: true, sideBySide: false });
  });

  it('a landscape tablet is large and side-by-side', async () => {
    const { result } = await renderHook(at(TABLET_LANDSCAPE_WINDOW));
    expect(result.current).toEqual({ large: true, sideBySide: true });
  });
});

describe('useListGrid', () => {
  // No afterEach window reset: the global setup (jest/setup.unit.ts) does it before each test.

  it('single column on a phone: no key change, no wrapper style, no fixed item width', async () => {
    setTestWindow(PHONE_WINDOW);
    const { result } = await renderHook(() => useListGrid());
    expect(result.current).toEqual({
      listKey: 'columns-1',
      numColumns: 1,
      columnWidth: undefined,
      columnWrapperStyle: undefined,
    });
  });

  it('a phone held sideways stays single-column: a wide-but-small window is not a grid', async () => {
    // Rotating a phone into a fullscreen video must not change `listKey`, or the list underneath
    // remounts and loses its scroll position when the user comes back.
    setTestWindow(PHONE_LANDSCAPE_WINDOW);
    const { result } = await renderHook(() => useListGrid());
    expect(result.current).toEqual({
      listKey: 'columns-1',
      numColumns: 1,
      columnWidth: undefined,
      columnWrapperStyle: undefined,
    });

    // Rotating back keeps the same key (no remount across the round trip).
    await act(() => {
      setTestWindow(PHONE_WINDOW);
    });
    expect(result.current.listKey).toBe('columns-1');
    expect(result.current.numColumns).toBe(1);
  });

  it('follows the window across tablet sizes', async () => {
    setTestWindow(TABLET_PORTRAIT_WINDOW); // 1024 wide → 3 columns
    const { result } = await renderHook(() => useListGrid());
    expect(result.current.numColumns).toBe(3);
    expect(result.current.listKey).toBe('columns-3');
    expect(result.current.columnWidth).toBe(320);
    expect(result.current.columnWrapperStyle).toEqual({ gap: LIST_GAP });

    // Rotating to landscape (1366 wide) bumps the grid to 4 columns and remounts the list.
    await act(() => {
      setTestWindow(TABLET_LANDSCAPE_WINDOW);
    });
    expect(result.current.numColumns).toBe(4);
    expect(result.current.listKey).toBe('columns-4');
  });
});
