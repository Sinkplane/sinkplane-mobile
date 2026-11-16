import type { ReactElement } from 'react';

import { DownloadsScreen } from '@/components/downloads/DownloadsScreen';

/** Settings › Downloads (also reachable signed out, from the sign-in screen). */
export default function Downloads(): ReactElement {
  return <DownloadsScreen />;
}
