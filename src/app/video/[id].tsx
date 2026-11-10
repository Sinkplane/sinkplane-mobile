import { useCallback, useMemo, type ReactElement } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PlaybackMedia } from '@/components/player/PlaybackSession';
import { PlayerPlaceholder } from '@/components/player/PlayerPlaceholder';
import { usePlayerPage } from '@/components/player/use-player-page';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { CommentItem } from '@/components/video-page/CommentItem';
import { CommentsFooter } from '@/components/video-page/CommentsFooter';
import { isTextOnly, PostImage } from '@/components/video-page/PostImage';
import { VideoDetails } from '@/components/video-page/VideoDetails';
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

/** Breathing room below the last comment, on top of the safe-area inset. */
const LIST_BOTTOM_PADDING = 24;
const COMMENTS_END_REACHED_THRESHOLD = 0.5;

type PostQuery = ReturnType<typeof useGetVideoPost>;
type DeliveryQuery = ReturnType<typeof useGetVideoDelivery>;
type PlayerPage = ReturnType<typeof usePlayerPage>;
type VideoAttachment = VideoPost['videoAttachments'][number];

/** The post's fields as the API may send them (the channel and thumbnail can be missing). */
interface LoosePost {
  readonly channel?: { readonly title: string } | null;
  readonly thumbnail?: { readonly path: string } | null;
  readonly videoAttachments?: readonly VideoAttachment[] | null;
}

function firstAttachment(post: LoosePost | undefined): VideoAttachment | undefined {
  return post?.videoAttachments?.[0];
}

/** The post, its first video attachment, that attachment's playable stream, comments and reaction. */
function useVideoData(id: string) {
  const { token, tokenExpiration } = useSession();
  const post = useGetVideoPost(token ?? undefined, tokenExpiration ?? undefined, id);
  const attachment = firstAttachment(post.data);
  const delivery = useGetVideoDelivery(
    token ?? undefined,
    tokenExpiration ?? undefined,
    attachment?.guid,
  );
  const streamUrl = getStreamUrl(delivery.data);
  const comments = usePostComments(token, id);
  const reaction = usePostReaction(token, post.data);
  return { token, post, attachment, delivery, streamUrl, comments, reaction };
}

/** Saves watch progress; the mutation also patches the cached post / list progress, so reopening the video resumes here. */
function useSaveProgress(token: string | null | undefined, id: string) {
  const { mutate: mutateProgress } = useUpdateVideoProgress(token ?? undefined);
  return useCallback(
    (seconds: number) => {
      if (token !== null && token !== undefined && token !== '' && id !== '') {
        mutateProgress({ id, progress: seconds });
      }
    },
    [token, id, mutateProgress],
  );
}

interface PlayerSlotProps {
  readonly id: string;
  readonly data: ReturnType<typeof useVideoData>;
  readonly page: PlayerPage;
  readonly onSaveProgress: (seconds: number) => void;
}

function nowPlaying(post: VideoPost): { channel: string | undefined; artwork: string | undefined } {
  const loose: LoosePost = post;
  return { channel: loose.channel?.title, artwork: loose.thumbnail?.path };
}

function videoMedia(id: string, title: string, channel: string | undefined): PlaybackMedia {
  const media: PlaybackMedia = { key: `video:${id}`, kind: 'video', id, title };
  if (channel !== undefined) {
    media.subtitle = channel;
  }
  return media;
}

function PlayableVideo({
  id,
  post,
  streamUrl,
  data,
  page,
  onSaveProgress,
}: PlayerSlotProps & { readonly post: VideoPost; readonly streamUrl: string }): ReactElement {
  const { channel, artwork } = nowPlaying(post);
  return (
    <VideoPlayer
      source={buildVideoSource(streamUrl, data.token, {
        title: post.title,
        artist: channel,
        artwork,
      })}
      title={post.title}
      initialTime={post.progress ?? undefined}
      fallbackDuration={data.attachment?.duration}
      fullscreen={page.fullscreen}
      tabletop={page.tabletop}
      onFullscreenChange={page.setFullscreen}
      onBack={page.minimize}
      onSaveProgress={onSaveProgress}
      media={videoMedia(id, post.title, channel)}
    />
  );
}

/** The delivery failed, or answered without a playable variant. */
function isUnplayable(delivery: DeliveryQuery, streamUrl: string | null | undefined): boolean {
  return delivery.isError || (delivery.data !== undefined && !hasStream(streamUrl));
}

function hasStream(streamUrl: string | null | undefined): streamUrl is string {
  return streamUrl !== null && streamUrl !== undefined && streamUrl !== '';
}

/** Whatever goes in the player slot instead of the player (errors, images, loading), if anything. */
function slotStandIn(post: PostQuery, data: PlayerSlotProps['data']): ReactElement | undefined {
  if (post.isError) {
    return (
      <PlayerPlaceholder message="Couldn't load this video." onRetry={() => void post.refetch()} />
    );
  }
  if (post.data && data.attachment === undefined) {
    return <PostImage post={post.data} />;
  }
  if (isUnplayable(data.delivery, data.streamUrl)) {
    return (
      <PlayerPlaceholder
        message="This video can't be played right now."
        onRetry={() => void data.delivery.refetch()}
      />
    );
  }
  return undefined;
}

function PlayerSlot(props: PlayerSlotProps): ReactElement {
  const { post, streamUrl } = props.data;
  const standIn = slotStandIn(post, props.data);
  if (standIn !== undefined) {
    return standIn;
  }
  if (!post.data || !hasStream(streamUrl)) {
    return <PlayerPlaceholder />;
  }
  return <PlayableVideo {...props} post={post.data} streamUrl={streamUrl} />;
}

function CommentList({
  data,
  style,
}: Readonly<{ data: ReturnType<typeof useVideoData>; style: PlayerPageStyle }>): ReactElement {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const { comments, reaction } = data;
  const post = data.post.data;
  const commentList = useMemo(() => comments.data?.pages.flat() ?? [], [comments.data]);
  const loadMore = () => {
    if (comments.hasNextPage && !comments.isFetchingNextPage) {
      void comments.fetchNextPage();
    }
  };

  return (
    <FlatList
      testID="comment-list"
      style={style}
      data={commentList}
      keyExtractor={(comment: PostComment) => comment.id}
      renderItem={({ item }) => <CommentItem comment={item} />}
      ListHeaderComponent={post ? <VideoDetails post={post} reaction={reaction} /> : undefined}
      ListFooterComponent={<CommentsFooter comments={comments} />}
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

type PlayerPageStyle = ReturnType<typeof playerPageLayout>['details'];

export default function VideoScreen(): ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const data = useVideoData(id);
  const page = usePlayerPage('video', id, hasStream(data.streamUrl));
  const { immersive } = page;
  // Text-only posts have no media to put beside the details: they stay stacked (full-width details).
  const sideBySide = page.sideBySide && !isTextOnly(data.post.data);
  const layout = playerPageLayout({ immersive, sideBySide }, insets);
  const saveProgress = useSaveProgress(data.token, id);

  return (
    <View
      testID="video-screen"
      // The page background first: immersive pages override it with black.
      style={[{ backgroundColor }, layout.page]}
    >
      <Stack.Screen options={{ gestureEnabled: !immersive }} />
      <StatusBar hidden={immersive} {...(immersive ? { style: 'light' } : {})} />
      {/* Large screens in landscape: the player on the left, details and comments scrolling beside it. */}
      <View testID="player-column" style={layout.player}>
        <PlayerSlot id={id} data={data} page={page} onSaveProgress={saveProgress} />
      </View>
      {immersive ? null : <CommentList data={data} style={layout.details} />}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
  },
});
