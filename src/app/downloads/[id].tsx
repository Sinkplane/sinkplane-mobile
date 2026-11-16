import type { ReactElement } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { DownloadedVideoPage } from '@/components/downloads/DownloadedVideoPage';

/** A downloaded video's offline player (also reachable signed out). */
export default function DownloadedVideoScreen(): ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DownloadedVideoPage id={id} />;
}
