import { useEffect, useState } from 'react';
import type { VideoPlayer } from 'expo-video';

import { HOLD_PLAYBACK_RATE } from '@/components/player/constants';
import { applyPlayerSettings } from '@/components/player/player-settings';
import { useStorageState } from '@/shared';

export interface PlaybackSpeed {
  /** The picked speed (live: always 1×). */
  rate: number;
  /** Press-and-hold boost active. */
  holding: boolean;
  startHold: () => void;
  endHold: () => void;
  menuOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  /** Picks a speed from the menu (persisted) and closes it. */
  selectSpeed: (rate: number) => void;
}

/**
 * The playback speed picked in the speed menu (persisted across videos), applied to the player
 * unless a press-and-hold boost is active. Live streams always play at 1×.
 */
function usePlaybackRate(player: VideoPlayer, live: boolean, holding: boolean) {
  const [[, storedRate], setStoredRate] = useStorageState<number>('playbackSpeed');
  const rate = live ? 1 : (storedRate ?? 1);

  useEffect(() => {
    if (!holding) {
      applyPlayerSettings(player, { playbackRate: rate });
    }
  }, [player, rate, holding]);

  return [rate, setStoredRate] as const;
}

/** Speed menu, persisted speed and the press-and-hold 2× boost (neither for live streams). */
export function usePlaybackSpeed(player: VideoPlayer, live: boolean): PlaybackSpeed {
  const [holding, setHolding] = useState(false);
  const [rate, setStoredRate] = usePlaybackRate(player, live, holding);
  const [menuOpen, setMenuOpen] = useState(false);

  return {
    rate,
    holding,
    startHold: () => {
      if (live || !player.playing) {
        return;
      }
      setHolding(true);
      applyPlayerSettings(player, { playbackRate: HOLD_PLAYBACK_RATE });
    },
    endHold: () => {
      setHolding(false);
      applyPlayerSettings(player, { playbackRate: rate });
    },
    menuOpen,
    openMenu: () => {
      setMenuOpen(true);
    },
    closeMenu: () => {
      setMenuOpen(false);
    },
    selectSpeed: (speed) => {
      setStoredRate(speed);
      setMenuOpen(false);
    },
  };
}
