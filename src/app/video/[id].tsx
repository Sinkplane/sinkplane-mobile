import { useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayerPlaceholder } from '@/components/player/PlayerPlaceholder';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { CommentItem } from '@/components/video-page/CommentItem';
import { VideoDetails } from '@/components/video-page/VideoDetails';
import { usePlayerPage } from '@/hooks/use-player-page';
import { usePostComments, type PostComment } from '@/hooks/use-post-comments';
import { usePostReaction } from '@/hooks/use-post-reaction';
import {
  useColorScheme,
  useGetVideoDelivery,
  useGetVideoPost,
  useSession,
  useThemeColor,
  useUpdateVideoProgress,
  type VideoPost,
} from '@/shared';
import { playerPageLayout } from '@/utils/player-page-layout';
import { buildVideoSource, getStreamUrl } from '@/utils/stream-source';

function postImageUri(post: VideoPost) {
  return post.pictureAttachments?.[0]?.thumbnail?.path ?? post.thumbnail?.path;
}

/** A loaded post with neither a video nor a picture: nothing to put in the player slot. */
function isTextOnly(post: VideoPost | undefined) {
  return !!post && !post.videoAttachments?.[0] && !postImageUri(post);
}

/** Media slot for posts without a video: picture posts show their image, text-only posts show nothing. */
function PostImage({ post }: { post: VideoPost }) {
  const uri = postImageUri(post);
  if (!uri) return null;
  return (
    <View testID="post-image" style={styles.postImage}>
      <Image source={uri} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel={post.title} />
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
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const colorScheme = useColorScheme();
  const { token, tokenExpiration } = useSession();

  const post = useGetVideoPost(token ?? undefined, tokenExpiration ?? undefined, id);
  const attachment = post.data?.videoAttachments?.[0];
  const delivery = useGetVideoDelivery(token ?? undefined, tokenExpiration ?? undefined, attachment?.guid);
  const comments = usePostComments(token, id);
  const reaction = usePostReaction(token, post.data);
  const streamUrl = getStreamUrl(delivery.data);

  const { fullscreen, setFullscreen, tabletop, immersive, sideBySide, minimize } = usePlayerPage('video', id, !!streamUrl);
  // Text-only posts have no media to put beside the details: they stay stacked (full-width details).
  const layout = playerPageLayout({ immersive, sideBySide: sideBySide && !isTextOnly(post.data) }, insets);

  // The mutation also patches the cached post / list progress, so reopening the video resumes here.
  const { mutate: mutateProgress } = useUpdateVideoProgress(token ?? undefined);
  const saveProgress = useCallback(
    (seconds: number) => {
      if (token && id) mutateProgress({ id, progress: seconds });
    },
    [token, id, mutateProgress],
  );

  const commentList = useMemo(() => comments.data?.pages.flat() ?? [], [comments.data]);

  const renderPlayer = () => {
    if (post.isError) return <PlayerPlaceholder message="Couldn't load this video." onRetry={() => post.refetch()} />;
    if (post.data && !attachment) return <PostImage post={post.data} />;
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
        tabletop={tabletop}
        onFullscreenChange={setFullscreen}
        onBack={minimize}
        onSaveProgress={saveProgress}
        media={{ key: `video:${id}`, kind: 'video', id, title: post.data.title, subtitle: post.data.channel?.title }}
      />
    );
  };

  return (
    <View
      testID="video-screen"
      // The page background first: immersive pages override it with black.
      style={[{ backgroundColor }, layout.page]}
    >
      <Stack.Screen options={{ gestureEnabled: !immersive }} />
      <StatusBar hidden={immersive} style={immersive ? 'light' : undefined} />
      {/* Large screens in landscape: the player on the left, details and comments scrolling beside it. */}
      <View testID="player-column" style={layout.player}>
        {renderPlayer()}
      </View>
      {immersive ? null : (
        <FlatList
          testID="comment-list"
          style={layout.details}
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
  postImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
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
