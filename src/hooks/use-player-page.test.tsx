import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { mockFoldPosture } from '@test/mocks/fold-posture';

import { PlaybackProvider, usePlaybackSession, usePlaybackStore, type PlaybackStore } from '@/components/player/PlaybackSession';
import { usePlayerPage } from '@/hooks/use-player-page';

const mockRouter = {
  back: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn(() => true),
  canDismiss: jest.fn(() => true),
  dismissAll: jest.fn(),
};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const wrapper = ({ children }: { children: ReactNode }) => <PlaybackProvider>{children}</PlaybackProvider>;
const SOURCE = { uri: 'https://edge.floatplane.test/a.m3u8' };

async function renderPage(kind: 'video' | 'live', id: string | undefined, playable = true) {
  return renderHook(
    (props: { id: string | undefined; playable: boolean }) => ({
      page: usePlayerPage(kind, props.id, props.playable),
      store: usePlaybackStore() as PlaybackStore,
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
    const { player } = result.current.store.acquire({ key: 'video:a', kind: 'video', id: 'a' }, SOURCE);
    await act(async () => result.current.store.attach(player));

    await act(async () => result.current.page.minimize());
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
    await act(async () => result.current.page.minimize());
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    expect(mockRouter.dismissAll).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('opening a page stops other media playing in the mini player', async () => {
    const { result, rerender } = await renderPage('video', undefined);
    const { player } = result.current.store.acquire({ key: 'live:x', kind: 'live', id: 'x' }, SOURCE);
    await act(async () => result.current.store.attach(player));
    expect(result.current.session).not.toBeNull();

    await rerender({ id: 'a', playable: true });
    expect(result.current.session).toBeNull();
  });

  it('reports fullscreen / tabletop layout, tabletop only once playable', async () => {
    mockFoldPosture.set({ state: 'halfOpened' });
    const { result, rerender } = await renderPage('live', 'x', false);
    expect(result.current.page).toMatchObject({ fullscreen: false, tabletop: null, immersive: false });

    await rerender({ id: 'x', playable: true });
    expect(result.current.page.tabletop).toEqual({ hingeTop: 667, hingeBottom: 667 });
    expect(result.current.page.immersive).toBe(true);

    await act(async () => result.current.page.setFullscreen(true));
    await act(async () => mockFoldPosture.set({ state: 'flat' }));
    expect(result.current.page).toMatchObject({ fullscreen: true, tabletop: null, immersive: true });
  });
});
