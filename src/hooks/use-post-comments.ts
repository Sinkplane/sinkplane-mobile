import {
  skipToken,
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';

import { isNonEmpty } from '@/hooks/is-non-empty';
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

/** The cursor of the next page: the id of the last comment loaded (none for the first page). */
type CommentsCursor = string | undefined;

export type PostCommentsResult = UseInfiniteQueryResult<
  InfiniteData<PostComment[], CommentsCursor>
>;

async function fetchComments(
  token: string,
  postId: string,
  fetchAfter: CommentsCursor,
): Promise<PostComment[]> {
  const params = new URLSearchParams({ blogPost: postId, limit: COMMENTS_PAGE_SIZE.toString() });
  if (isNonEmpty(fetchAfter)) {
    params.append('fetchAfter', fetchAfter);
  }

  const response = await authenticatedFetch(`/api/v3/comment?${params.toString()}`, token);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch comments: ${String(response.status)} - ${errorText}`);
  }
  return (await response.json()) as PostComment[];
}

const nextCursor = (lastPage: PostComment[]): CommentsCursor =>
  lastPage.length < COMMENTS_PAGE_SIZE ? undefined : lastPage.at(-1)?.id;

/** Top-level comments of a post, paged by the id of the last comment loaded (`fetchAfter`). */
export function usePostComments(
  token: string | null | undefined,
  postId: string | undefined,
): PostCommentsResult {
  return useInfiniteQuery({
    queryKey: ['post-comments', token, postId],
    queryFn:
      isNonEmpty(token) && isNonEmpty(postId)
        ? ({ pageParam }) => fetchComments(token, postId, pageParam)
        : skipToken,
    initialPageParam: undefined as CommentsCursor,
    getNextPageParam: nextCursor,
  });
}
