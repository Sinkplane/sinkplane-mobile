import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VideoPlayer } from '@/components/player/VideoPlayer';
import { CommentItem } from '@/components/video-page/CommentItem';
import { VideoDetails } from '@/components/video-page/VideoDetails';
import { useFullscreenOrientation } from '@/hooks/use-fullscreen-orientation';
import { usePostComments, type PostComment } from '@/hooks/use-post-comments';
import { usePostReaction } from '@/hooks/use-post-reaction';
import { useColorScheme, useGetVideoDelivery, useGetVideoPost, useSession, useThemeColor, useUpdateVideoProgress } from '@/shared';
import { buildVideoSource, getStreamUrl } from '@/utils/stream-source';

function PlayerPlaceholder({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View testID="player-placeholder" style={styles.placeholder}>
      {message ? <Text style={styles.placeholderText}>{message}</Text> : <ActivityIndicator color="#fff" />}
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.retryButton} accessibilityRole="button">
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function CommentsFooter({ comments }: { comments: ReturnType<typeof usePostComments> }) {
  const mutedColor = useThemeColor({}, 'icon');
  if (comments.isLoading || comments.isFetchingNextPage) return <ActivityIndicator style={styles.footer} />;
  if (comments.isError) {
    return (
      <Pressable testID="comments-retry" onPress={() => comments.refetch()} style={styles.footer} accessibilityRole="button">
        <Text style={[styles.footerText, { color: mutedColor }]}>Couldn&apos;t load comments. Tap to retry.</Text>
      </Pressable>
    );
  }
  if (comments.data?.pages[0]?.length) return null;
  return <Text style={[styles.footer, styles.footerText, { color: mutedColor }]}>No comments yet.</Text>;
}

export default function VideoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const colorScheme = useColorScheme();
  const { token, tokenExpiration } = useSession();
  const [fullscreen, setFullscreen] = useState(false);

  const post = useGetVideoPost(token ?? undefined, tokenExpiration ?? undefined, id);
  const attachment = post.data?.videoAttachments?.[0];
  const delivery = useGetVideoDelivery(token ?? undefined, tokenExpiration ?? undefined, attachment?.guid);
  const comments = usePostComments(token, id);
  const reaction = usePostReaction(token, post.data);

  const exitFullscreen = useCallback(() => setFullscreen(false), []);
  useFullscreenOrientation(fullscreen, exitFullscreen);

  // The mutation also patches the cached post / list progress, so reopening the video resumes here.
  const { mutate: mutateProgress } = useUpdateVideoProgress(token ?? undefined);
  const saveProgress = useCallback(
    (seconds: number) => {
      if (token && id) mutateProgress({ id, progress: seconds });
    },
    [token, id, mutateProgress],
  );

  const streamUrl = getStreamUrl(delivery.data);
  const commentList = useMemo(() => comments.data?.pages.flat() ?? [], [comments.data]);

  const renderPlayer = () => {
    if (post.isError) return <PlayerPlaceholder message="Couldn't load this video." onRetry={() => post.refetch()} />;
    if (post.data && !attachment) return <PlayerPlaceholder message="This post has no video." />;
    if (delivery.isError || (delivery.data && !streamUrl)) {
      return <PlayerPlaceholder message="This video can't be played right now." onRetry={() => delivery.refetch()} />;
    }
    if (!post.data || !streamUrl) return <PlayerPlaceholder />;
    return (
      <VideoPlayer
        source={buildVideoSource(streamUrl, token, {
          title: post.data.title,
          artist: post.data.channel?.title,
          artwork: post.data.thumbnail?.path,
        })}
        title={post.data.title}
        initialTime={post.data.progress ?? undefined}
        fallbackDuration={attachment?.duration}
        fullscreen={fullscreen}
        onFullscreenChange={setFullscreen}
        onBack={() => router.back()}
        onSaveProgress={saveProgress}
      />
    );
  };

  return (
    <View
      testID="video-screen"
      style={[styles.container, { backgroundColor, paddingTop: fullscreen ? 0 : insets.top }, fullscreen && styles.fullscreen]}
    >
      <Stack.Screen options={{ gestureEnabled: !fullscreen }} />
      <StatusBar hidden={fullscreen} style={fullscreen ? 'light' : undefined} />
      {renderPlayer()}
      {fullscreen ? null : (
        <FlatList
          testID="comment-list"
          data={commentList}
          keyExtractor={(comment: PostComment) => comment.id}
          renderItem={({ item }) => <CommentItem comment={item} />}
          ListHeaderComponent={post.data ? <VideoDetails post={post.data} reaction={reaction} /> : undefined}
          ListFooterComponent={<CommentsFooter comments={comments} />}
          onEndReached={() => {
            if (comments.hasNextPage && !comments.isFetchingNextPage) comments.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          indicatorStyle={colorScheme === 'dark' ? 'white' : 'default'}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fullscreen: {
    backgroundColor: '#000',
  },
  placeholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#000',
  },
  placeholderText: {
    color: '#fff',
    fontSize: 15,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 16,
  },
  footer: {
    paddingVertical: 24,
  },
  footerText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
