import { useEffect } from 'react';
import { useRouter } from 'expo-router';

import { usePlaybackStore, type PlaybackMedia } from '@/components/player/PlaybackSession';
import { useTabletopLayout, type TabletopLayout } from '@/hooks/use-fold-posture';
import { useFullscreenOrientation } from '@/hooks/use-fullscreen-orientation';
import { useScreenLayout } from '@/hooks/use-screen-layout';

export interface PlayerPage {
  fullscreen: boolean;
  setFullscreen: (fullscreen: boolean) => void;
  tabletop: TabletopLayout | null;
  immersive: boolean;
  wide: boolean;
  minimize: () => void;
}

/**
 * Shared wiring for a player page (video / live):
 * - playback session: opening the page stops whatever other media the mini player was playing;
 *   `minimize` (the player's close arrow) hands this page's playback to the mini player and returns
 *   to the list, like YouTube.
 * - layout: rotation-driven `fullscreen` (see `useFullscreenOrientation`) and, on a foldable
 *   half-opened like a laptop, the `tabletop` split. Either one makes the page `immersive`: the
 *   player takes the whole screen. Both only apply once the stream is `playable`. On a large
 *   screen in landscape (and not immersive) the page is `wide`: the details stay below the player,
 *   whose height is capped so they keep room.
 */
export function usePlayerPage(
  kind: PlaybackMedia['kind'],
  id: string | undefined,
  playable: boolean,
): PlayerPage {
  const store = usePlaybackStore();
  const router = useRouter();
  const { large, wide } = useScreenLayout();
  const { fullscreen, setFullscreen } = useFullscreenOrientation(playable, large);
  const posture = useTabletopLayout();
  const tabletop = playable ? posture : null;
  const immersive = fullscreen || tabletop !== null;

  useEffect(() => {
    if (id === undefined || id === '') {
      return;
    }
    store?.claim(kind, id);
    return () => store?.unclaim();
  }, [store, kind, id]);

  return {
    fullscreen,
    setFullscreen,
    tabletop,
    immersive,
    wide: wide && !immersive,
    minimize: () => {
      store?.minimize();
      // Back to the list, past any other player page underneath (it would hide the mini player).
      // Opened from a notification / deep link there may be nothing in the stack to return to.
      if (router.canDismiss()) {
        router.dismissAll();
      } else {
        router.replace('/');
      }
    },
  };
}
