import { useCallback } from 'react';
import { useRouter } from 'expo-router';

/** Opens a post's video page (`/video/[id]`); stable across renders. */
export function useOpenVideo(): (video: { readonly id: string }) => void {
  const router = useRouter();
  return useCallback(
    (video: { readonly id: string }) => {
      router.push({ pathname: '/video/[id]', params: { id: video.id } });
    },
    [router],
  );
}
