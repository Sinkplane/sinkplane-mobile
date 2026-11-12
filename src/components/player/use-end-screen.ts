import { useState, type ReactNode } from 'react';

import type { PlaybackState } from '@/components/player/use-playback-state';

export interface EndScreenActions {
  replay: () => void;
  /** Hides the end screen until the video ends again. */
  dismiss: () => void;
}

/** Renders the end screen (suggested videos) for the given actions. */
export type EndScreenRenderer = (actions: EndScreenActions) => ReactNode;

interface EndScreenContext {
  state: Pick<PlaybackState, 'ended' | 'endCount'>;
  /** Replays the ended video (the player's play / pause / replay toggle). */
  actions: { togglePlay: () => void };
}

/**
 * The end screen once a video played to the end, unless it was dismissed since that ending.
 * `suppressed`: never shown (live streams, picture-in-picture). `null` while it isn't showing.
 */
export function useEndScreen(
  render: EndScreenRenderer | undefined,
  suppressed: boolean,
  { state, actions }: Readonly<EndScreenContext>,
): ReactNode {
  const [dismissedEnd, setDismissedEnd] = useState<number | null>(null);
  const showing = !suppressed && state.ended && dismissedEnd !== state.endCount;
  if (render === undefined || !showing) {
    return null;
  }
  return render({
    replay: actions.togglePlay,
    dismiss: () => {
      setDismissedEnd(state.endCount);
    },
  });
}
