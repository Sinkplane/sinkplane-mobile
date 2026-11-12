import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { mockFoldPosture } from '@test/mocks/fold-posture';
import {
  PHONE_WINDOW,
  setTestWindow,
  TABLET_LANDSCAPE_WINDOW,
  TABLET_PORTRAIT_WINDOW,
} from '@test/window-size';

import {
  PlaybackProvider,
  usePlaybackSession,
  usePlaybackStore,
  type PlaybackStore,
} from '@/components/player/PlaybackSession';
import { usePlayerPage } from '@/components/player/use-player-page';

const mockRouter = {
  back: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn(() => true),
  canDismiss: jest.fn(() => true),
  dismissAll: jest.fn(),
};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <PlaybackProvider>{children}</PlaybackProvider>
);
const SOURCE = { uri: 'https://edge.floatplane.test/a.m3u8' };

/** The provider's store (always there under `wrapper`). */
function useProvidedStore(): PlaybackStore {
  const store = usePlaybackStore();
  if (!store) {
    throw new Error('usePlayerPage tests render inside a PlaybackProvider');
  }
  return store;
}

async function renderPage(kind: 'video' | 'live', id: string | undefined, playable = true) {
  return renderHook(
    (props: { id: string | undefined; playable: boolean }) => ({
      page: usePlayerPage(kind, props.id, props.playable),
      store: useProvidedStore(),
      session: usePlaybackSession(),
    }),
    { wrapper, initialProps: { id, playable } },
  );
}

describe('usePlayerPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter.canGoBack.mockReturnValue(true);
    mockRouter.canDismiss.mockReturnValue(true);
  });

  it('minimize hands playback to the mini player and dismisses every screen back to the list', async () => {
    const { result } = await renderPage('video', 'a');
    const { player } = result.current.store.acquire(
      { key: 'video:a', kind: 'video', id: 'a' },
      SOURCE,
    );
    await act(() => {
      result.current.store.attach(player);
    });

    await act(() => {
      result.current.page.minimize();
    });
    expect(result.current.session?.minimized).toBe(true);
    // Not `back`: a player page underneath (video A under video B) must be dropped too, or it
    // would cover the mini player.
    expect(mockRouter.dismissAll).toHaveBeenCalledTimes(1);
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('goes to the feed when there is nothing in the stack to dismiss (deep link)', async () => {
    mockRouter.canDismiss.mockReturnValue(false);
    const { result } = await renderPage('video', 'a');
    await act(() => {
      result.current.page.minimize();
    });
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    expect(mockRouter.dismissAll).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('opening a page stops other media playing in the mini player', async () => {
    const { result, rerender } = await renderPage('video', undefined);
    const { player } = result.current.store.acquire(
      { key: 'live:x', kind: 'live', id: 'x' },
      SOURCE,
    );
    await act(() => {
      result.current.store.attach(player);
    });
    expect(result.current.session).not.toBeNull();

    await rerender({ id: 'a', playable: true });
    expect(result.current.session).toBeNull();
  });

  it('a page closing without ever reaching a player returns the covered page its suspended session', async () => {
    const { result, rerender } = await renderPage('video', 'a');
    // The page underneath is playing: its player view is still attached.
    const { player: a } = result.current.store.acquire(
      { key: 'video:a', kind: 'video', id: 'a' },
      SOURCE,
    );
    await act(() => {
      result.current.store.attach(a);
    });
    expect(result.current.session?.player).toBe(a);

    // This page opens on top for another video that never loads (no player for it): the page
    // underneath suspends.
    await rerender({ id: 'b', playable: true });
    expect(result.current.session).toBeNull();

    // Backing out before anything played: the covered page takes its session back.
    await rerender({ id: undefined, playable: true });
    expect(result.current.session).toMatchObject({
      media: { key: 'video:a' },
      player: a,
      minimized: false,
    });
  });

  it('reports fullscreen / tabletop layout, tabletop only once playable', async () => {
    mockFoldPosture.set({ state: 'halfOpened' });
    const { result, rerender } = await renderPage('live', 'x', false);
    expect(result.current.page).toMatchObject({
      fullscreen: false,
      tabletop: null,
      immersive: false,
    });

    await rerender({ id: 'x', playable: true });
    expect(result.current.page.tabletop).toEqual({ hingeTop: 422, hingeBottom: 422 });
    expect(result.current.page.immersive).toBe(true);

    await act(() => {
      result.current.page.setFullscreen(true);
    });
    await act(() => {
      mockFoldPosture.set({ state: 'flat' });
    });
    expect(result.current.page).toMatchObject({
      fullscreen: true,
      tabletop: null,
      immersive: true,
    });
  });

  it('is wide on a landscape tablet, but not portrait, fullscreen, or tabletop', async () => {
    setTestWindow(TABLET_LANDSCAPE_WINDOW);
    const { result, rerender } = await renderPage('video', 'a');
    expect(result.current.page).toMatchObject({
      fullscreen: false,
      immersive: false,
      wide: true,
    });

    // A portrait tablet: the full-width player needs no cap.
    setTestWindow(TABLET_PORTRAIT_WINDOW);
    await rerender({ id: 'a', playable: true });
    expect(result.current.page.wide).toBe(false);

    // Back to landscape, fullscreen takes the whole screen instead.
    setTestWindow(TABLET_LANDSCAPE_WINDOW);
    await rerender({ id: 'a', playable: true });
    expect(result.current.page.wide).toBe(true);
    await act(() => {
      result.current.page.setFullscreen(true);
    });
    expect(result.current.page).toMatchObject({
      fullscreen: true,
      immersive: true,
      wide: false,
    });

    // A half-opened fold (portrait, iOS-style posture) is also immersive, not wide.
    setTestWindow(TABLET_PORTRAIT_WINDOW);
    mockFoldPosture.set({ state: 'halfOpened' });
    await act(() => Promise.resolve());
    expect(result.current.page).toMatchObject({ immersive: true, wide: false });

    setTestWindow(PHONE_WINDOW);
  });
});
