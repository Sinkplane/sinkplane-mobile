import type { ReactElement } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DownloadedVideoDetails } from '@/components/downloads/DownloadedVideoDetails';
import { useGoBack } from '@/components/downloads/ScreenHeader';
import { CommentItem } from '@/components/video-page/CommentItem';
import { CommentsFooter, type CommentsFooterState } from '@/components/video-page/CommentsFooter';
import { commentsToShow, type VideoPageData } from '@/components/video-page/use-video-page-data';
import { VideoDetails } from '@/components/video-page/VideoDetails';
import type { PostComment } from '@/hooks/use-post-comments';
import { useColorScheme } from '@/shared';

/** Breathing room below the last comment, on top of the safe-area inset. */
const LIST_BOTTOM_PADDING = 24;
const COMMENTS_END_REACHED_THRESHOLD = 0.5;

/** The footer reads the live comments query, or (offline, from the saved copy) a settled one. */
function footerState(data: VideoPageData): CommentsFooterState {
  const { comments, savedComments } = data;
  if (data.loadedComments !== undefined || savedComments === undefined) {
    return comments;
  }
  return {
    isLoading: false,
    isFetchingNextPage: false,
    isError: false,
    data: { pages: [savedComments] },
    refetch: comments.refetch,
  };
}

/** Above the comments: the post's details, else (offline, never opened online) the download's. */
function ListHeader({ data }: Readonly<{ data: VideoPageData }>): ReactElement | null {
  const goBack = useGoBack();
  if (data.postData !== undefined) {
    return <VideoDetails post={data.postData} reaction={data.reaction} />;
  }
  if (data.download !== undefined) {
    return <DownloadedVideoDetails video={data.download} onDeleted={goBack} />;
  }
  return null;
}

/** Below the player: the details, then the comments (paged; offline, the saved ones). */
export function VideoComments({ data }: Readonly<{ data: VideoPageData }>): ReactElement {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const { comments } = data;
  const loadMore = () => {
    if (comments.hasNextPage && !comments.isFetchingNextPage) {
      void comments.fetchNextPage();
    }
  };

  return (
    <FlatList
      testID="comment-list"
      data={commentsToShow(data)}
      keyExtractor={(comment: PostComment) => comment.id}
      renderItem={({ item }) => (
        <CommentItem comment={item} token={data.token} offline={data.offline} />
      )}
      ListHeaderComponent={<ListHeader data={data} />}
      ListFooterComponent={<CommentsFooter comments={footerState(data)} />}
      onEndReached={loadMore}
      onEndReachedThreshold={COMMENTS_END_REACHED_THRESHOLD}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + LIST_BOTTOM_PADDING },
      ]}
      indicatorStyle={colorScheme === 'dark' ? 'white' : 'default'}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
  },
});
