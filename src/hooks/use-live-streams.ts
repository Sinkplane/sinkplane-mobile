import { useEffect, useRef } from 'react';
import { useQueries } from '@tanstack/react-query';

import { authenticatedFetch, type Creator, type LiveStream, type VideoDelivery } from '@/shared';
import { getStreamUrl } from '@/utils/stream-source';

/** How often the tab bar re-checks whether a creator went live or ended their stream (TV app parity). */
export const LIVE_POLL_MS = 60_000;

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

/**
 * Live delivery info for a livestream id, or `null` while it is offline: the delivery endpoint
 * answers 404 for a livestream that isn't broadcasting.
 */
async function fetchLiveDelivery(token: string, liveStreamId: string): Promise<VideoDelivery | null> {
  const params = new URLSearchParams({ scenario: 'live', entityId: liveStreamId, entityKind: 'livestream' });
  const response = await authenticatedFetch(`/api/v3/delivery/info?${params.toString()}`, token);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Failed to check the live stream: ${response.status} - ${await response.text()}`);
  return response.json();
}

function liveStatus(data: VideoDelivery | null | undefined, streamUrl: string | null, isError: boolean): LiveStatus {
  if (data === undefined) return isError ? 'error' : 'loading';
  return streamUrl ? 'live' : 'offline';
}

/**
 * Live status of every given creator that has a Floatplane livestream, live ones first. Queries
 * are shared by key, so the tab bar (which polls with `poll`) and the screens observe the same data.
 */
export function useLiveStreams(
  token: string | null | undefined,
  creators: Creator[] | undefined,
  { poll = false }: { poll?: boolean } = {},
): CreatorLiveStream[] {
  const streamers = (creators ?? []).filter((creator): creator is Creator & { liveStream: LiveStream } => !!creator.liveStream?.id);

  // useQueries does not supply previous data to placeholder callbacks. Keep answers by stream
  // identity so rotating the token doesn't briefly unmount an already playing live stream.
  const previous = useRef(new Map<string, { data: VideoDelivery | null; checkedAt: number }>());

  const results = useQueries({
    queries: streamers.map(creator => ({
      queryKey: ['live-delivery', token, creator.liveStream.id],
      queryFn: () => fetchLiveDelivery(token as string, creator.liveStream.id),
      enabled: !!token,
      refetchInterval: poll ? LIVE_POLL_MS : false,
      // A refreshed token starts a new query; keep showing the last answer meanwhile.
      placeholderData: () => (token ? previous.current.get(creator.liveStream.id)?.data : undefined),
    })),
  });

  useEffect(() => {
    const answers = new Map<string, { data: VideoDelivery | null; checkedAt: number }>();
    streamers.forEach((creator, index) => {
      const query = results[index]!;
      const answer =
        query.data === undefined || query.isPlaceholderData
          ? previous.current.get(creator.liveStream.id)
          : { data: query.data, checkedAt: query.dataUpdatedAt };
      if (answer) answers.set(creator.liveStream.id, answer);
    });
    previous.current = answers;
  });

  const streams = streamers.map((creator, index): CreatorLiveStream => {
    const query = results[index]!;
    const streamUrl = getStreamUrl(query.data, { live: true });
    return {
      id: creator.id,
      creator,
      liveStream: creator.liveStream,
      status: liveStatus(query.data, streamUrl, query.isError),
      streamUrl,
      error: query.error,
      isFetching: query.isFetching,
      checkedAt: query.isPlaceholderData ? (previous.current.get(creator.liveStream.id)?.checkedAt ?? 0) : query.dataUpdatedAt,
      refetch: query.refetch,
    };
  });

  return [...streams.filter(stream => stream.status === 'live'), ...streams.filter(stream => stream.status !== 'live')];
}
