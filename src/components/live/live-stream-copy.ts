import { imagePath } from '@/components/image-path';
import type { CreatorLiveStream } from '@/hooks/use-live-streams';
import { htmlToText } from '@/utils/format-video';

export interface LiveStreamCopy {
  title: string;
  description: string;
  thumbnail: string | undefined;
}

type LiveStreamCopySource = Pick<CreatorLiveStream, 'status' | 'liveStream' | 'creator'>;

/** The creator's "offline" card as the API may send it: creators don't have to configure one. */
type OfflineCard = Partial<CreatorLiveStream['liveStream']['offline']> | null | undefined;

function offlineTitle(offline: OfflineCard, creator: CreatorLiveStream['creator']): string {
  const title = offline?.title ?? '';
  return title === '' ? `${creator.title} is not live right now.` : title;
}

function offlineCopy(offline: OfflineCard, creator: CreatorLiveStream['creator']): LiveStreamCopy {
  return {
    title: offlineTitle(offline, creator),
    description: htmlToText(offline?.description),
    thumbnail: imagePath(offline?.thumbnail) ?? imagePath(creator.cover),
  };
}

/**
 * Title / description / thumbnail to show for a creator's livestream in its current state: the
 * stream's own while live, otherwise the "offline" card the creator configured (falling back to
 * a generic notice and the creator's cover).
 */
export function liveStreamCopy({
  status,
  liveStream,
  creator,
}: LiveStreamCopySource): LiveStreamCopy {
  if (status === 'live') {
    return {
      title: liveStream.title,
      description: htmlToText(liveStream.description),
      thumbnail: imagePath(liveStream.thumbnail),
    };
  }
  return offlineCopy(liveStream.offline, creator);
}
