import { useCallback } from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';

import { logError } from '@/utils/log';

const FLOATPLANE_ORIGIN = 'https://www.floatplane.com';
const POST_LINK = /^(?:https?:\/\/(?:www\.)?floatplane\.com)?\/post\/([a-z0-9]+)/i;

/** The post id of a floatplane.com post link (absolute or site-relative), else `undefined`. */
export function floatplanePostId(href: string): string | undefined {
  return POST_LINK.exec(href)?.[1];
}

/** Site-relative hrefs (`/channel/…`) point at floatplane.com, as they do on the website. */
function absoluteUrl(href: string): string {
  return /^\/(?!\/)/.test(href) ? FLOATPLANE_ORIGIN + href : href;
}

/** Opens a post body link: Floatplane posts on their in-app video page, anything else externally. */
export function useOpenLink(): (href: string) => void {
  const router = useRouter();
  return useCallback(
    (href: string) => {
      const postId = floatplanePostId(href);
      if (postId !== undefined) {
        router.push({ pathname: '/video/[id]', params: { id: postId } });
        return;
      }
      Linking.openURL(absoluteUrl(href)).catch((error: unknown) => {
        logError(`Couldn't open link ${href}`, error);
      });
    },
    [router],
  );
}
