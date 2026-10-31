import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { authenticatedFetch, type VideoPost } from '@/shared';

export type Reaction = 'like' | 'dislike' | null;

interface ReactionState {
  reaction: Reaction;
  likes: number;
  dislikes: number;
}

/**
 * The signed-in user's reaction. The content API returns `userInteraction` as `['like']` /
 * `['dislike']` (the shared types model it as objects), so both shapes are accepted.
 */
export function getReaction(post: Pick<VideoPost, 'userInteraction' | 'selfUserInteraction'>): Reaction {
  const interactions = [...(post.userInteraction ?? []), post.selfUserInteraction];
  const has = (kind: 'like' | 'dislike') => interactions.some(i => (i as unknown) === kind || (kind === 'like' ? i?.liked : i?.disliked));
  if (has('like')) return 'like';
  if (has('dislike')) return 'dislike';
  return null;
}

function stateFromPost(post: VideoPost | undefined): ReactionState {
  return { reaction: post ? getReaction(post) : null, likes: post?.likes ?? 0, dislikes: post?.dislikes ?? 0 };
}

/** Apply the reaction the server reports after a toggle, adjusting both counters. */
export function applyReaction(state: ReactionState, next: Reaction): ReactionState {
  const count = (kind: 'like' | 'dislike', total: number) => total - (state.reaction === kind ? 1 : 0) + (next === kind ? 1 : 0);
  return { reaction: next, likes: count('like', state.likes), dislikes: count('dislike', state.dislikes) };
}

/**
 * Like/dislike for a post. Floatplane toggles: posting the active reaction again removes it, and the
 * response is the resulting interaction list (`['like']`, `['dislike']` or `[]`).
 */
export function usePostReaction(token: string | null | undefined, post: VideoPost | undefined) {
  // Server-confirmed state after a toggle; falls back to the post's own data (e.g. after a refetch
  // or when navigating to another post).
  const [confirmed, setConfirmed] = useState<{ postId: string; state: ReactionState } | null>(null);
  const state = confirmed && confirmed.postId === post?.id ? confirmed.state : stateFromPost(post);

  const mutation = useMutation({
    mutationFn: async (kind: 'like' | 'dislike'): Promise<Reaction> => {
      const response = await authenticatedFetch(`/api/v3/content/${kind}`, token as string, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: post?.id, contentType: 'blogPost' }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to ${kind} post: ${response.status} - ${errorText}`);
      }
      const result: string[] = await response.json();
      if (result.includes('like')) return 'like';
      if (result.includes('dislike')) return 'dislike';
      return null;
    },
    onSuccess: next => {
      if (post) setConfirmed({ postId: post.id, state: applyReaction(state, next) });
    },
  });

  return {
    ...state,
    isPending: mutation.isPending,
    error: mutation.error,
    toggle: (kind: 'like' | 'dislike') => {
      if (!token || !post || mutation.isPending) return;
      mutation.mutate(kind);
    },
  };
}
