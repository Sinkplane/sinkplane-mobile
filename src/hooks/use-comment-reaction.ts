import {
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';

import { isNonEmpty } from '@/hooks/is-non-empty';
import { postCommentsKey, type PostComment } from '@/hooks/use-post-comments';
import {
  applyReaction,
  getReaction,
  type PostReaction,
  type Reaction,
  type ReactionKind,
  type ReactionState,
} from '@/hooks/use-post-reaction';
import { authenticatedFetch } from '@/shared';

/** The signed-in user's reaction to a comment and its counters, as the comment list reports them. */
export function commentReactionState(comment: PostComment): ReactionState {
  return {
    reaction: getReaction({ userInteraction: comment.userInteraction ?? undefined }),
    likes: comment.likes,
    dislikes: comment.dislikes,
  };
}

/** The comment after the server reports `next` as the user's reaction (counters adjusted). */
export function withCommentReaction(comment: PostComment, next: Reaction): PostComment {
  const { likes, dislikes } = applyReaction(commentReactionState(comment), next);
  return { ...comment, likes, dislikes, userInteraction: next === null ? [] : [next] };
}

function reactionValues(body: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(body);
    return Array.isArray(parsed) ? (parsed as unknown[]) : [parsed];
  } catch {
    return [body.trim()];
  }
}

/**
 * The reaction a comment toggle reports. Floatplane answers in plain text (`like` / `dislike`);
 * a JSON string or interaction list is accepted too, and anything else means no reaction.
 */
export function parseCommentReaction(body: string): Reaction {
  const values = reactionValues(body);
  if (values.includes('like')) {
    return 'like';
  }
  return values.includes('dislike') ? 'dislike' : null;
}

interface ToggleVariables {
  token: string;
  comment: PostComment;
  kind: ReactionKind;
}

/** Posts a comment toggle and returns the reaction Floatplane reports afterwards. */
async function postCommentReaction({ token, comment, kind }: ToggleVariables): Promise<Reaction> {
  const response = await authenticatedFetch(`/api/v3/comment/${kind}`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment: comment.id, blogPost: comment.blogPost }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Failed to ${kind} comment: ${String(response.status)} - ${body}`);
  }
  return parseCommentReaction(body);
}

type CommentPages = InfiniteData<PostComment[], string | undefined>;

function patchPages(pages: CommentPages, commentId: string, next: Reaction): CommentPages {
  const patch = (comment: PostComment) =>
    comment.id === commentId ? withCommentReaction(comment, next) : comment;
  return { ...pages, pages: pages.pages.map((page) => page.map(patch)) };
}

/** Writes the confirmed reaction into the cached comment pages, so it survives list recycling. */
function patchCachedComment(
  queryClient: QueryClient,
  { token, comment }: ToggleVariables,
  next: Reaction,
): void {
  queryClient.setQueryData<CommentPages>(postCommentsKey(token, comment.blogPost), (pages) =>
    pages === undefined ? pages : patchPages(pages, comment.id, next),
  );
}

/**
 * Like/dislike for a comment (`POST /api/v3/comment/{like,dislike}` with `{ comment, blogPost }`).
 * The state is read from the comment itself; a confirmed toggle patches the post's cached comment
 * pages, which re-renders the comment with the new reaction and counters.
 */
export function useCommentReaction(
  token: string | null | undefined,
  comment: PostComment,
): PostReaction {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: postCommentReaction,
    onSuccess: (next, variables) => {
      patchCachedComment(queryClient, variables, next);
    },
  });

  return {
    ...commentReactionState(comment),
    isPending: mutation.isPending,
    error: mutation.error,
    toggle: (kind) => {
      if (!isNonEmpty(token) || mutation.isPending) {
        return;
      }
      mutation.mutate({ token, comment, kind });
    },
  };
}
