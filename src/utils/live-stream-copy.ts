import type { CreatorLiveStream } from '@/hooks/use-live-streams';
import { htmlToText } from '@/utils/format-video';

/**
 * Title / description / thumbnail to show for a creator's livestream in its current state: the
 * stream's own while live, otherwise the "offline" card the creator configured (falling back to
 * a generic notice and the creator's cover).
 */
export function liveStreamCopy({ status, liveStream, creator }: Pick<CreatorLiveStream, 'status' | 'liveStream' | 'creator'>) {
  if (status === 'live') {
    return { title: liveStream.title, description: htmlToText(liveStream.description), thumbnail: liveStream.thumbnail?.path };
  }
  return {
    title: liveStream.offline?.title || `${creator.title} is not live right now.`,
    description: htmlToText(liveStream.offline?.description),
    thumbnail: liveStream.offline?.thumbnail?.path ?? creator.cover?.path,
  };
}
