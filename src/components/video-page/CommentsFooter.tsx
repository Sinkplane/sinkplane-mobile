import type { ReactElement } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import type { PostComment } from '@/hooks/use-post-comments';
import { useThemeColor } from '@/shared';

/** The parts of the comments query the footer reads. */
export interface CommentsFooterState {
  readonly isLoading: boolean;
  readonly isFetchingNextPage: boolean;
  readonly isError: boolean;
  readonly data?: { readonly pages: readonly (readonly PostComment[])[] } | undefined;
  readonly refetch: () => unknown;
}

function hasComments(comments: CommentsFooterState): boolean {
  const firstPage = comments.data?.pages[0];
  return firstPage !== undefined && firstPage.length > 0;
}

/** Below the comments: a spinner while loading, a retry button on errors, or "No comments yet." */
export function CommentsFooter({
  comments,
}: Readonly<{ comments: CommentsFooterState }>): ReactElement | null {
  const mutedColor = useThemeColor({}, 'icon');
  if (comments.isLoading || comments.isFetchingNextPage) {
    return <ActivityIndicator style={styles.footer} />;
  }
  if (comments.isError) {
    return (
      <Pressable
        testID="comments-retry"
        onPress={() => {
          void comments.refetch();
        }}
        style={styles.footer}
        accessibilityRole="button"
      >
        <Text style={[styles.footerText, { color: mutedColor }]}>
          Couldn&apos;t load comments. Tap to retry.
        </Text>
      </Pressable>
    );
  }
  if (hasComments(comments)) {
    return null;
  }
  return (
    <Text style={[styles.footer, styles.footerText, { color: mutedColor }]}>No comments yet.</Text>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingVertical: 24,
  },
  footerText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
