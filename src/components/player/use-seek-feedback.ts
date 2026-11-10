import { useEffect, useRef, useState } from 'react';

import { SEEK_STEP_SECONDS } from '@/components/player/constants';
import type { SeekSide } from '@/hooks/use-player-gestures';

const SEEK_FEEDBACK_MS = 600;

export interface SeekFeedback {
  side: SeekSide;
  seconds: number;
}

/** The "−15s" / "+15s" bubble after a double tap; repeated double taps accumulate, like YouTube. */
export function useSeekFeedback(): {
  feedback: SeekFeedback | null;
  show: (side: SeekSide) => void;
} {
  const [feedback, setFeedback] = useState<SeekFeedback | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
    }
  };

  useEffect(() => clearTimer, []);

  const show = (side: SeekSide) => {
    setFeedback((current) => ({
      side,
      seconds: (current?.side === side ? current.seconds : 0) + SEEK_STEP_SECONDS,
    }));
    clearTimer();
    timer.current = setTimeout(() => {
      setFeedback(null);
    }, SEEK_FEEDBACK_MS);
  };

  return { feedback, show };
}
