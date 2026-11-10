import { Platform } from 'react-native';
import type * as ReactNative from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import {
  emitOrientationChange,
  getOrientationAsync,
  lockAsync,
  Orientation,
  OrientationLock,
  orientationListenerCount,
} from '@test/mocks/expo-screen-orientation';
import { PHONE_WINDOW, setTestWindow, TABLET_LANDSCAPE_WINDOW } from '@test/window-size';

import {
  lockAppOrientation,
  useFullscreenOrientation,
  type FullscreenOrientation,
} from '@/hooks/use-fullscreen-orientation';

const rotate = (orientation: Orientation) =>
  act(() => {
    emitOrientationChange(orientation);
  });

/** Toggle fullscreen by hand, as the player button does. */
const chooseFullscreen = (result: { current: FullscreenOrientation }, next: boolean) =>
  act(() => {
    result.current.setFullscreen(next);
  });

/** An auto-rotating player page whose window may grow into a large one (a foldable unfolding). */
const useFoldablePage = ({ large }: { large: boolean }) => useFullscreenOrientation(true, large);

describe('lockAppOrientation', () => {
  afterEach(() => {
    // Undo the web-platform swap below before the next describe's tests run.
    jest.replaceProperty(Platform, 'OS', 'ios').restore();
  });

  it('locks phones to upright portrait', () => {
    lockAppOrientation(false);
    expect(lockAsync).toHaveBeenCalledWith(OrientationLock.PORTRAIT_UP);
  });

  it('lets tablets rotate freely (DEFAULT, following app.json)', () => {
    lockAppOrientation(true);
    expect(lockAsync).toHaveBeenCalledWith(OrientationLock.DEFAULT);
  });

  it('does nothing on web', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    lockAppOrientation(true);
    lockAppOrientation(false);
    expect(lockAsync).not.toHaveBeenCalled();
  });
});

describe('useFullscreenOrientation', () => {
  const { BackHandler } = jest.requireActual<typeof ReactNative>('react-native');
  let backHandlers: (() => boolean | null | undefined)[];
  let addBackListener: jest.SpiedFunction<typeof BackHandler.addEventListener>;

  beforeEach(() => {
    lockAsync.mockClear();
    backHandlers = [];
    addBackListener = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, handler) => {
        backHandlers.push(handler as () => boolean | null | undefined);
        return { remove: () => undefined };
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.replaceProperty(Platform, 'OS', 'ios').restore();
  });

  const renderOrientation = (autoRotate: boolean, largeScreen = false) =>
    renderHook(
      ({ auto, large }: { auto: boolean; large: boolean }) => useFullscreenOrientation(auto, large),
      {
        initialProps: { auto: autoRotate, large: largeScreen },
      },
    );

  it('stays portrait and ignores rotation until there is something to play', async () => {
    const { result, rerender, unmount } = await renderOrientation(false);

    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.PORTRAIT_UP);
    expect(orientationListenerCount()).toBe(0);
    expect(result.current.fullscreen).toBe(false);

    await rerender({ auto: true, large: false });
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.DEFAULT);
    expect(orientationListenerCount()).toBe(1);

    await unmount();
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.PORTRAIT_UP);
    expect(orientationListenerCount()).toBe(0);
  });

  it('follows the device: sideways enters fullscreen, upright leaves it', async () => {
    const { result } = await renderOrientation(true);

    await rotate(Orientation.LANDSCAPE_LEFT);
    expect(result.current.fullscreen).toBe(true);

    await rotate(Orientation.PORTRAIT_UP);
    expect(result.current.fullscreen).toBe(false);

    await rotate(Orientation.LANDSCAPE_RIGHT);
    expect(result.current.fullscreen).toBe(true);

    // Face-up / face-down readings carry no orientation; keep the current mode.
    await rotate(Orientation.UNKNOWN);
    expect(result.current.fullscreen).toBe(true);
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.DEFAULT);
  });

  it('locks to the user’s choice once they toggle fullscreen themselves', async () => {
    const { result } = await renderOrientation(true);

    await chooseFullscreen(result, true);
    expect(result.current.fullscreen).toBe(true);
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.LANDSCAPE);
    expect(orientationListenerCount()).toBe(0);

    await chooseFullscreen(result, false);
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.PORTRAIT_UP);

    // Rotations no longer reach the hook: the screen is locked portrait.
    await rotate(Orientation.LANDSCAPE_LEFT);
    expect(result.current.fullscreen).toBe(false);
  });

  it('exiting a rotation-entered fullscreen by hand locks portrait', async () => {
    const { result } = await renderOrientation(true);
    await rotate(Orientation.LANDSCAPE_LEFT);

    await chooseFullscreen(result, false);
    expect(result.current.fullscreen).toBe(false);
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.PORTRAIT_UP);
  });

  describe('picking up the current orientation when following starts', () => {
    // The read of the device's orientation at follow-start races the listener: an event that
    // arrives first must win, and a result landing after stop/unmount must be dropped.
    const settle = () => act(() => Promise.resolve());

    /** Queue a controllable result for the hook's next `getOrientationAsync` call. */
    const queueRead = () => {
      let deferred!: {
        resolve: (orientation: Orientation) => void;
        reject: (error: unknown) => void;
      };
      const pending = new Promise<Orientation>((resolve, reject) => {
        deferred = { resolve, reject };
      });
      getOrientationAsync.mockReturnValueOnce(pending);
      return deferred;
    };

    it('starts fullscreen when the device is already landscape when following starts', async () => {
      const read = queueRead();
      const { result } = await renderOrientation(true);
      expect(result.current.fullscreen).toBe(false); // not yet: the read is still in flight

      read.resolve(Orientation.LANDSCAPE_RIGHT);
      await settle();
      expect(result.current.fullscreen).toBe(true);
    });

    it('a foldable that unfolded, rotated, then folded back picks up the current orientation', async () => {
      const first = queueRead();
      const { result, rerender } = await renderHook(useFoldablePage, {
        initialProps: { large: false },
      });

      // Phone, rotated sideways → fullscreen.
      await rotate(Orientation.LANDSCAPE_LEFT);
      first.resolve(Orientation.PORTRAIT_UP);
      await settle();
      expect(result.current.fullscreen).toBe(true); // the event won this effect's race

      // Unfolded into a large window: the page lays out instead of going fullscreen, no listener.
      await rerender({ large: true });
      expect(result.current.fullscreen).toBe(false);
      expect(orientationListenerCount()).toBe(0);

      // Folded back (phone again): following restarts and reads the device — still upright, so
      // fullscreen stays off rather than replaying the stale sideways state.
      const second = queueRead();
      await rerender({ large: false });
      second.resolve(Orientation.PORTRAIT_UP);
      await settle();
      expect(result.current.fullscreen).toBe(false);
    });

    it('an orientation event that arrives before the async read wins', async () => {
      const read = queueRead();
      const { result } = await renderOrientation(true);

      await rotate(Orientation.LANDSCAPE_LEFT); // beats the pending read to it
      read.resolve(Orientation.PORTRAIT_UP);
      await settle();
      expect(result.current.fullscreen).toBe(true); // the event's landscape, not the read's portrait
    });

    it('ignores an UNKNOWN reading from the async read', async () => {
      const read = queueRead();
      const { result } = await renderOrientation(true);

      read.resolve(Orientation.UNKNOWN);
      await settle();
      expect(result.current.fullscreen).toBe(false);
    });

    it('swallows a rejected read', async () => {
      const read = queueRead();
      const { result } = await renderOrientation(true);

      read.reject(new Error('orientation unavailable'));
      await settle();
      expect(result.current.fullscreen).toBe(false);

      // Following still works afterwards: events keep driving fullscreen.
      await rotate(Orientation.LANDSCAPE_LEFT);
      expect(result.current.fullscreen).toBe(true);
    });

    it('drops the read that lands after following stops (the user chose fullscreen)', async () => {
      const read = queueRead();
      const { result } = await renderOrientation(true);

      // The user toggles fullscreen before any rotation event: following stops (the effect's
      // cleanup flags the in-flight read as stale — same flag an unmount sets).
      await chooseFullscreen(result, true);
      expect(result.current.fullscreen).toBe(true);

      read.resolve(Orientation.PORTRAIT_UP);
      await settle();
      expect(result.current.fullscreen).toBe(true); // the stale read must not override their choice
    });
  });

  it('handles the Android back button only while fullscreen, exiting instead of leaving', async () => {
    const { result, unmount } = await renderOrientation(true);
    expect(addBackListener).not.toHaveBeenCalled();

    await rotate(Orientation.LANDSCAPE_LEFT);
    expect(addBackListener).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
    expect(backHandlers).toHaveLength(1);

    let handled: boolean | null | undefined;
    const [pressBack] = backHandlers;
    await act(() => {
      handled = pressBack?.();
    });
    expect(handled).toBe(true); // handled: leave fullscreen, not the screen
    expect(result.current.fullscreen).toBe(false);
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.PORTRAIT_UP);

    await unmount();
    expect(addBackListener).toHaveBeenCalledTimes(1); // no resubscription after exit
  });

  it('swallows orientation lock failures', async () => {
    lockAsync.mockRejectedValue(new Error('unsupported'));
    lockAppOrientation(true);
    const { unmount } = await renderOrientation(true);
    await unmount();
    expect(lockAsync).toHaveBeenCalledTimes(3);
    lockAsync.mockResolvedValue(undefined);
  });

  it('does nothing on web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    lockAsync.mockClear();

    lockAppOrientation(true);
    const { result, unmount } = await renderOrientation(true);
    await chooseFullscreen(result, true);
    await unmount();

    // No native orientation lock or rotation tracking on web (the back-button effect is a harmless web stub there).
    expect(lockAsync).not.toHaveBeenCalled();
    expect(orientationListenerCount()).toBe(0);
  });
});

describe('useFullscreenOrientation on large screens', () => {
  const { BackHandler } = jest.requireActual<typeof ReactNative>('react-native');
  let addBackListener: jest.SpiedFunction<typeof BackHandler.addEventListener>;

  beforeEach(() => {
    lockAsync.mockClear();
    setTestWindow(TABLET_LANDSCAPE_WINDOW);
    addBackListener = jest.spyOn(BackHandler, 'addEventListener');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setTestWindow(PHONE_WINDOW);
  });

  const renderLarge = (autoRotate: boolean) =>
    renderHook(({ auto }: { auto: boolean }) => useFullscreenOrientation(auto, true), {
      initialProps: { auto: autoRotate },
    });

  it('never follows the device and always keeps DEFAULT, whatever fullscreen does', async () => {
    const { result } = await renderLarge(true);

    expect(orientationListenerCount()).toBe(0); // no rotation tracking on large screens

    await rotate(Orientation.LANDSCAPE_LEFT);
    expect(result.current.fullscreen).toBe(false); // the page lays out sideways, it doesn't go fullscreen
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.DEFAULT);

    // Toggling fullscreen by hand hides the details but still never locks the orientation.
    await chooseFullscreen(result, true);
    expect(result.current.fullscreen).toBe(true);
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.DEFAULT);

    // Android back still exits fullscreen (rather than leaving the page) — the orientation stays free.
    expect(addBackListener).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
  });

  it('unmount restores the app-wide policy: DEFAULT for large, PORTRAIT_UP for a phone', async () => {
    const phone = await renderHook(useFoldablePage, {
      initialProps: { large: false },
    });
    await phone.unmount();
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.PORTRAIT_UP);

    lockAsync.mockClear();
    const tablet = await renderHook(useFoldablePage, {
      initialProps: { large: true },
    });
    await tablet.unmount();
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.DEFAULT);
  });

  it('rotation-driven fullscreen does not carry over when the window becomes large', async () => {
    const { result, rerender } = await renderHook(useFoldablePage, {
      initialProps: { large: false },
    });

    // A phone rotated sideways is fullscreen…
    await rotate(Orientation.LANDSCAPE_LEFT);
    expect(result.current.fullscreen).toBe(true);

    // …but unfolding into a large window lays the page out instead (a foldable half-way open).
    await rerender({ large: true });
    expect(result.current.fullscreen).toBe(false);
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.DEFAULT);
    expect(orientationListenerCount()).toBe(0); // listener unsubscribed with the resize
  });
});
