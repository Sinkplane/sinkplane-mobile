import { useQuery } from '@tanstack/react-query';

import { isNonEmpty } from '@/hooks/is-non-empty';
import { authenticatedFetch, type VideoDelivery } from '@/shared';
import { getDownloadOptions, type DownloadOption } from '@/utils/download-options';

/** The signed file URLs expire, so a reopened sheet refetches after this long. */
const OPTIONS_STALE_MS = 60_000;

async function fetchDownloadDelivery(token: string, guid: string): Promise<VideoDelivery> {
  const params = new URLSearchParams({ scenario: 'download', entityId: guid });
  const response = await authenticatedFetch(`/api/v3/delivery/info?${params.toString()}`, token);
  if (!response.ok) {
    throw new Error(`Failed to fetch download info: ${String(response.status)}`);
  }
  return (await response.json()) as VideoDelivery;
}

export interface DownloadOptionsQuery {
  readonly options: DownloadOption[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly refetch: () => void;
}

/**
 * The downloadable qualities of a video attachment (`scenario=download` delivery info), fetched
 * only while `enabled` (the quality sheet is open). `durationSeconds` estimates missing sizes.
 */
export function useDownloadOptions(
  token: string | null | undefined,
  guid: string | undefined,
  { enabled, durationSeconds }: { enabled: boolean; durationSeconds?: number | undefined },
): DownloadOptionsQuery {
  const query = useQuery({
    queryKey: ['download-delivery', token, guid],
    queryFn: () => fetchDownloadDelivery(token ?? '', guid ?? ''),
    enabled: enabled && isNonEmpty(token) && isNonEmpty(guid),
    staleTime: OPTIONS_STALE_MS,
    // The sheet shows a Retry button: no silent retries delaying the error.
    retry: false,
  });
  return {
    options: getDownloadOptions(query.data, durationSeconds),
    isLoading: query.isPending && query.fetchStatus !== 'idle',
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
