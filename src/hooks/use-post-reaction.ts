import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { isNonEmpty } from '@/hooks/is-non-empty';
import { authenticatedFetch, type VideoPost } from '@/shared';

type ReactionKind = 'like' | 'dislike';
export type Reaction = ReactionKind | null;

interface ReactionState {
  reaction: Reaction;
  likes: number;
  dislikes: number;
}

export interface PostReaction extends ReactionState {
  isPending: boolean;
  error: Error | null;
  toggle: (kind: ReactionKind) => void;
}

/**
 * What the content API actually sends: `userInteraction` entries are `'like'` / `'dislike'`
 * strings, while the shared types model them (and `selfUserInteraction`) as flag objects.
 */
interface ReactionSource {
  userInteraction?: readonly unknown[] | undefined;
  selfUserInteraction?: unknown;
}

const REACTION_FLAG = { like: 'liked', dislike: 'disliked' } as const;

/** An interaction entry in either shape (`'like'`, or `{ liked: true }`) that matches `kind`. */
function matchesReaction(interaction: unknown, kind: ReactionKind): boolean {
  if (interaction === kind) {
    return true;
  }
  return (
    typeof interaction === 'object' &&
    interaction !== null &&
    Reflect.get(interaction, REACTION_FLAG[kind]) === true
  );
}

/**
 * The signed-in user's reaction. The content API returns `userInteraction` as `['like']` /
 * `['dislike']` (the shared types model it as objects), so both shapes are accepted.
 */
export function getReaction(post: ReactionSource): Reaction {
  const interactions = [...(post.userInteraction ?? []), post.selfUserInteraction];
  const has = (kind: ReactionKind) =>
    interactions.some((interaction) => matchesReaction(interaction, kind));
  if (has('like')) {
    return 'like';
  }
  return has('dislike') ? 'dislike' : null;
}

function stateFromPost(post: VideoPost | undefined): ReactionState {
  return {
    reaction: post ? getReaction(post) : null,
    likes: post?.likes ?? 0,
    dislikes: post?.dislikes ?? 0,
  };
}

/** Apply the reaction the server reports after a toggle, adjusting both counters. */
export function applyReaction(state: ReactionState, next: Reaction): ReactionState {
  const count = (kind: ReactionKind, total: number) =>
    total - (state.reaction === kind ? 1 : 0) + (next === kind ? 1 : 0);
  return {
    reaction: next,
    likes: count('like', state.likes),
    dislikes: count('dislike', state.dislikes),
  };
}

interface ToggleVariables {
  token: string;
  postId: string;
  kind: ReactionKind;
}

/** Posts a toggle and returns the reaction Floatplane reports afterwards. */
async function postReaction({ token, postId, kind }: ToggleVariables): Promise<Reaction> {
  const response = await authenticatedFetch(`/api/v3/content/${kind}`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: postId, contentType: 'blogPost' }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to ${kind} post: ${String(response.status)} - ${errorText}`);
  }
  const result = (await response.json()) as string[];
  if (result.includes('like')) {
    return 'like';
  }
  return result.includes('dislike') ? 'dislike' : null;
}

/**
 * Like/dislike for a post. Floatplane toggles: posting the active reaction again removes it, and the
 * response is the resulting interaction list (`['like']`, `['dislike']` or `[]`).
 */
export function usePostReaction(
  token: string | null | undefined,
  post: VideoPost | undefined,
): PostReaction {
  // Server-confirmed state after a toggle; falls back to the post's own data (e.g. after a refetch
  // or when navigating to another post).
  const [confirmed, setConfirmed] = useState<{ postId: string; state: ReactionState } | null>(null);
  const state =
    confirmed !== null && confirmed.postId === post?.id ? confirmed.state : stateFromPost(post);

  const mutation = useMutation({
    mutationFn: postReaction,
    onSuccess: (next) => {
      if (post) {
        setConfirmed({ postId: post.id, state: applyReaction(state, next) });
      }
    },
  });

  return {
    ...state,
    isPending: mutation.isPending,
    error: mutation.error,
    toggle: (kind) => {
      if (!isNonEmpty(token) || !post || mutation.isPending) {
        return;
      }
      mutation.mutate({ token, postId: post.id, kind });
    },
  };
}
