import { Platform } from 'react-native';
import { renderHook } from '@testing-library/react-native';
import { lockAsync, OrientationLock } from '@test/mocks/expo-screen-orientation';

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

  beforeEach(() => {
    lockAsync.mockClear();
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

  it('locks landscape while fullscreen and restores portrait on unmount', async () => {
    const { rerender, unmount } = await renderHook(
      ({ fullscreen }: { fullscreen: boolean }) => useFullscreenOrientation(fullscreen, jest.fn()),
      {
        initialProps: { fullscreen: false },
      },
    );

    expect(lockAsync).toHaveBeenCalledWith(OrientationLock.PORTRAIT_UP);

    await rerender({ fullscreen: true });
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.LANDSCAPE);

    await unmount();
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.PORTRAIT_UP);
  });

  it('re-locks portrait when fullscreen ends', async () => {
    const { rerender } = await renderHook(({ fullscreen }: { fullscreen: boolean }) => useFullscreenOrientation(fullscreen, jest.fn()), {
      initialProps: { fullscreen: true },
    });

    await rerender({ fullscreen: false });
    expect(lockAsync).toHaveBeenLastCalledWith(OrientationLock.PORTRAIT_UP);
  });

  it('handles the Android back button only while fullscreen, exiting instead of leaving', async () => {
    const exitFullscreen = jest.fn();
    const { rerender, unmount } = await renderHook(
      ({ fullscreen }: { fullscreen: boolean }) => useFullscreenOrientation(fullscreen, exitFullscreen),
      {
        initialProps: { fullscreen: false },
      },
    );

    expect(BackHandler.addEventListener).not.toHaveBeenCalled();

    await rerender({ fullscreen: true });
    expect(BackHandler.addEventListener).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
    expect(backHandlers).toHaveLength(1);

    expect(backHandlers[0]!()).toBe(true); // handled: leave fullscreen, not the screen
    expect(exitFullscreen).toHaveBeenCalledTimes(1);

    await rerender({ fullscreen: false });
    await unmount();
    expect(BackHandler.addEventListener).toHaveBeenCalledTimes(1); // no resubscription after exit
  });

  it('does nothing on web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    lockAsync.mockClear();

    lockPortrait();
    await renderHook(({ fullscreen }: { fullscreen: boolean }) => useFullscreenOrientation(fullscreen, jest.fn()), {
      initialProps: { fullscreen: true },
    });

    // No native orientation lock on web (the back-button effect is a harmless web stub there).
    expect(lockAsync).not.toHaveBeenCalled();
  });
});
