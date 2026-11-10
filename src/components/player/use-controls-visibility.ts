import { useEffect, useState } from 'react';

import { CONTROLS_HIDE_MS } from '@/components/player/constants';

export interface ControlsVisibility {
  visible: boolean;
  toggle: () => void;
  /** Any interaction with the controls restarts the hide timer. */
  touch: () => void;
}

/** Controls stay up while paused/ended/scrubbing, and hide after a few idle seconds while playing. */
export function useControlsVisibility(keepVisible: boolean): ControlsVisibility {
  const [visible, setVisible] = useState(true);
  const [activity, setActivity] = useState(0);

  useEffect(() => {
    if (!visible || keepVisible) {
      return;
    }
    const timer = setTimeout(() => {
      setVisible(false);
    }, CONTROLS_HIDE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [visible, keepVisible, activity]);

  return {
    visible: visible || keepVisible,
    toggle: () => {
      setVisible((shown) => !shown);
    },
    touch: () => {
      setVisible(true);
      setActivity((count) => count + 1);
    },
  };
}
