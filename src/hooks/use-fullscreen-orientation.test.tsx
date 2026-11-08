import { Platform } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import {
  emitOrientationChange,
  lockAsync,
  supportsOrientationLockAsync,
  Orientation,
  OrientationLock,
  orientationListenerCount,
} from '@test/mocks/expo-screen-orientation';

import { lockPortrait, useFullscreenOrientation } from '@/hooks/use-fullscreen-orientation';

describe('lockPortrait', () => {
  it('locks to upright portrait', () => {
    lockPortrait();
    expect(lockAsync).toHaveBeenCalledWith(OrientationLock.PORTRAIT_UP);
  });
});

describe('useFullscreenOrientation', () => {
  const { BackHandler } = jest.requireActual<typeof import('react-native')>('react-native');
  let backHandlers: Array<() => boolean | null | undefined>;

  const notchedIPhone = supportsOrientationLockAsync.getMockImplementation();

  beforeEach(() => {
    lockAsync.mockClear();
    if (notchedIPhone) supportsOrientationLockAsync.mockImplementation(notchedIPhone);
    backHandlers = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      backHandlers.push(handler as () => boolean | null | undefined);
      return { remove: () => {} };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.replaceProperty(Platform, 'OS', 'ios').restore();
  });

  const renderOrientation = (autoRotate: boolean) =>
    renderHook(({ auto }: { auto: boolean }) => useFullscreenOrientation(auto), { initialProps: { auto: autoRotate } });

  const rotate = (orientation: Orientation) =>
    act(() => {
      emitOrientationChange(orientation);
    });

  it('stays portrait and ignores rotation until there is something to play', async () => {
    const { result, rerender, unmount } = await renderOrientation(false);

    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.PORTRAIT_UP);
    expect(orientationListenerCount()).toBe(0);
    expect(result.current.fullscreen).toBe(false);

    await rerender({ auto: true });
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

    await rotate(Orientation.LANDSCAPE_LEFT);
    await rotate(Orientation.PORTRAIT_DOWN);
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

    await act(() => result.current.setFullscreen(true));
    expect(result.current.fullscreen).toBe(true);
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.LANDSCAPE);
    expect(orientationListenerCount()).toBe(0);

    await act(() => result.current.setFullscreen(false));
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.PORTRAIT_UP);

    // Rotations no longer reach the hook: the screen is locked portrait.
    await rotate(Orientation.LANDSCAPE_LEFT);
    expect(result.current.fullscreen).toBe(false);
  });

  it('exiting a rotation-entered fullscreen by hand locks portrait', async () => {
    const { result } = await renderOrientation(true);
    await rotate(Orientation.LANDSCAPE_LEFT);

    await act(() => result.current.setFullscreen(false));
    expect(result.current.fullscreen).toBe(false);
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.PORTRAIT_UP);
  });

  it('handles the Android back button only while fullscreen, exiting instead of leaving', async () => {
    const { result, unmount } = await renderOrientation(true);
    expect(BackHandler.addEventListener).not.toHaveBeenCalled();

    await rotate(Orientation.LANDSCAPE_LEFT);
    expect(BackHandler.addEventListener).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
    expect(backHandlers).toHaveLength(1);

    let handled: boolean | null | undefined;
    await act(() => {
      handled = backHandlers[0]!();
    });
    expect(handled).toBe(true); // handled: leave fullscreen, not the screen
    expect(result.current.fullscreen).toBe(false);
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.PORTRAIT_UP);

    await unmount();
    expect(BackHandler.addEventListener).toHaveBeenCalledTimes(1); // no resubscription after exit
  });

  it('allows upside-down portrait on iOS devices that support it (iPhone Duo), never asking for it elsewhere', async () => {
    supportsOrientationLockAsync.mockResolvedValue(true);

    const { result, rerender } = await renderOrientation(false);
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.PORTRAIT);
    await rerender({ auto: true });
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.ALL);
    await act(() => result.current.setFullscreen(true));
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.LANDSCAPE);
    await act(() => result.current.setFullscreen(false));
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.PORTRAIT);
  });

  it('treats a failing support check as no upside-down', async () => {
    supportsOrientationLockAsync.mockRejectedValue(new Error('no module'));
    await renderOrientation(true);
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.DEFAULT);
  });

  it('drops a lock superseded while its support check was pending', async () => {
    let answer: (supported: boolean) => void = () => {};
    supportsOrientationLockAsync.mockImplementationOnce(() => new Promise<boolean>(resolve => (answer = resolve)));
    const { result } = await renderOrientation(true);
    await act(() => result.current.setFullscreen(true));
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.LANDSCAPE);

    // The first (follow-device) check answers late: it must not undo the landscape lock.
    await act(async () => answer(false));
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.LANDSCAPE);
  });

  it('keeps the system-respecting locks on Android (ALL / PORTRAIT ignore the auto-rotate setting)', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const { result } = await renderOrientation(false);
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.PORTRAIT_UP);

    const followed = await renderOrientation(true);
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.DEFAULT);
    await act(() => followed.result.current.setFullscreen(false));
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.PORTRAIT_UP);
    expect(result.current.fullscreen).toBe(false);
  });

  it('swallows orientation lock failures', async () => {
    lockAsync.mockRejectedValue(new Error('unsupported'));
    lockPortrait();
    const { unmount } = await renderOrientation(true);
    await unmount();
    expect(lockAsync).toHaveBeenCalledTimes(3);
    lockAsync.mockResolvedValue(undefined);
  });

  it('does nothing on web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    lockAsync.mockClear();

    lockPortrait();
    const { result, unmount } = await renderOrientation(true);
    await act(() => result.current.setFullscreen(true));
    await unmount();

    // No native orientation lock or rotation tracking on web (the back-button effect is a harmless web stub there).
    expect(lockAsync).not.toHaveBeenCalled();
    expect(orientationListenerCount()).toBe(0);
  });
});
