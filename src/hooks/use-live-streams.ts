import { useEffect, useState } from 'react';
import { skipToken, useQueries, type UseQueryResult } from '@tanstack/react-query';

import { isNonEmpty } from '@/hooks/is-non-empty';
import { zip } from '@/hooks/zip';
import { authenticatedFetch, type Creator, type LiveStream, type VideoDelivery } from '@/shared';
import { getStreamUrl } from '@/utils/stream-source';

/** How often the tab bar re-checks whether a creator went live or ended their stream (TV app parity). */
export const LIVE_POLL_MS = 60_000;

/** The delivery endpoint's answer for a livestream that isn't broadcasting. */
const HTTP_NOT_FOUND = 404;

export type LiveStatus = 'loading' | 'live' | 'offline' | 'error';

export interface CreatorLiveStream {
  /** The creator id (list key). */
  id: string;
  creator: Creator;
  liveStream: LiveStream;
  status: LiveStatus;
  /** The playable HLS URL while live. */
  streamUrl: string | null;
  error: Error | null;
  isFetching: boolean;
  /** When the status was last confirmed by the API (0 before the first answer). */
  checkedAt: number;
  refetch: () => Promise<unknown>;
}

type Streamer = Creator & { liveStream: LiveStream };
type LiveQuery = UseQueryResult<VideoDelivery | null>;

interface Answer {
  data: VideoDelivery | null;
  checkedAt: number;
}

/** Last answers by livestream id, written after each render (a Map held in state, not a ref). */
type PreviousAnswers = Map<string, Answer>;

/**
 * Live delivery info for a livestream id, or `null` while it is offline: the delivery endpoint
 * answers 404 for a livestream that isn't broadcasting.
 */
async function fetchLiveDelivery(
  token: string,
  liveStreamId: string,
): Promise<VideoDelivery | null> {
  const params = new URLSearchParams({
    scenario: 'live',
    entityId: liveStreamId,
    entityKind: 'livestream',
  });
  const response = await authenticatedFetch(`/api/v3/delivery/info?${params.toString()}`, token);
  if (response.status === HTTP_NOT_FOUND) {
    return null;
  }
  if (!response.ok) {
    throw new Error(
      `Failed to check the live stream: ${String(response.status)} - ${await response.text()}`,
    );
  }
  return (await response.json()) as VideoDelivery;
}

function liveStatus(
  data: VideoDelivery | null | undefined,
  streamUrl: string | null,
  isError: boolean,
): LiveStatus {
  if (data === undefined) {
    return isError ? 'error' : 'loading';
  }
  return streamUrl === null ? 'offline' : 'live';
}

const isStreamer = (creator: Creator): creator is Streamer => (creator.liveStream?.id ?? '') !== '';

function useLiveDeliveryQueries(
  token: string | null | undefined,
  streamers: Streamer[],
  { poll, previous }: { poll: boolean; previous: PreviousAnswers },
): LiveQuery[] {
  return useQueries({
    queries: streamers.map((creator) => ({
      queryKey: ['live-delivery', token, creator.liveStream.id],
      queryFn: isNonEmpty(token)
        ? () => fetchLiveDelivery(token, creator.liveStream.id)
        : skipToken,
      refetchInterval: poll ? LIVE_POLL_MS : (false as const),
      // A refreshed token starts a new query; keep showing the last answer meanwhile.
      placeholderData: () =>
        isNonEmpty(token) ? previous.get(creator.liveStream.id)?.data : undefined,
    })),
  });
}

/** After each render, remember every stream's latest real answer (or keep the one before it). */
function useRememberAnswers(pairs: [Streamer, LiveQuery][], previous: PreviousAnswers): void {
  useEffect(() => {
    const answers = new Map<string, Answer>();
    for (const [creator, query] of pairs) {
      const answer =
        query.data === undefined || query.isPlaceholderData
          ? previous.get(creator.liveStream.id)
          : { data: query.data, checkedAt: query.dataUpdatedAt };
      if (answer) {
        answers.set(creator.liveStream.id, answer);
      }
    }
    previous.clear();
    answers.forEach((answer, id) => previous.set(id, answer));
  });
}

function toCreatorLiveStream(
  [creator, query]: [Streamer, LiveQuery],
  previous: PreviousAnswers,
): CreatorLiveStream {
  const streamUrl = getStreamUrl(query.data, { live: true });
  return {
    id: creator.id,
    creator,
    liveStream: creator.liveStream,
    status: liveStatus(query.data, streamUrl, query.isError),
    streamUrl,
    error: query.error,
    isFetching: query.isFetching,
    checkedAt: query.isPlaceholderData
      ? (previous.get(creator.liveStream.id)?.checkedAt ?? 0)
      : query.dataUpdatedAt,
    refetch: query.refetch,
  };
}

/**
 * Live status of every given creator that has a Floatplane livestream, live ones first. Queries
 * are shared by key, so the tab bar (which polls with `poll`) and the screens observe the same data.
 */
export function useLiveStreams(
  token: string | null | undefined,
  creators: Creator[] | undefined,
  { poll = false }: { poll?: boolean | undefined } = {},
): CreatorLiveStream[] {
  const streamers = (creators ?? []).filter(isStreamer);

  // useQueries does not supply previous data to placeholder callbacks. Keep answers by stream
  // identity so rotating the token doesn't briefly unmount an already playing live stream.
  const [previous] = useState<PreviousAnswers>(() => new Map());

  const results = useLiveDeliveryQueries(token, streamers, { poll, previous });
  const pairs = zip(streamers, results);
  useRememberAnswers(pairs, previous);

  const streams = pairs.map((pair) => toCreatorLiveStream(pair, previous));
  return [
    ...streams.filter((stream) => stream.status === 'live'),
    ...streams.filter((stream) => stream.status !== 'live'),
  ];
}
