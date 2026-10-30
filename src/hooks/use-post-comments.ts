import { useInfiniteQuery } from '@tanstack/react-query';

import { authenticatedFetch } from '@/shared';

/** A comment as returned by `GET /api/v3/comment` (only the fields this app renders). */
export interface PostComment {
  id: string;
  blogPost: string;
  user: {
    id: string;
    username: string;
    profileImage?: { path: string } | null;
  };
  text: string;
  postDate: string;
  editDate?: string | null;
  likes: number;
  dislikes: number;
  totalReplies?: number;
}

export const COMMENTS_PAGE_SIZE = 20;

async function fetchComments(token: string, postId: string, fetchAfter?: string): Promise<PostComment[]> {
  const params = new URLSearchParams({ blogPost: postId, limit: COMMENTS_PAGE_SIZE.toString() });
  if (fetchAfter) params.append('fetchAfter', fetchAfter);

  const response = await authenticatedFetch(`/api/v3/comment?${params.toString()}`, token);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch comments: ${response.status} - ${errorText}`);
  }
  return response.json();
}

/** Top-level comments of a post, paged by the id of the last comment loaded (`fetchAfter`). */
export function usePostComments(token: string | null | undefined, postId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['post-comments', token, postId],
    queryFn: ({ pageParam }) => fetchComments(token as string, postId as string, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => (lastPage.length < COMMENTS_PAGE_SIZE ? undefined : lastPage[lastPage.length - 1]?.id),
    enabled: !!token && !!postId,
  });
}
