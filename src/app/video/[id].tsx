import { useCallback, type ReactElement } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { VideoSource } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PlaybackMedia } from '@/components/player/PlaybackSession';
import { PlayerPlaceholder } from '@/components/player/PlayerPlaceholder';
import { usePlayerPage } from '@/components/player/use-player-page';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import type { EndScreenRenderer } from '@/components/player/use-end-screen';
import { PostImage } from '@/components/video-page/PostImage';
import { SuggestedVideos } from '@/components/video-page/SuggestedVideos';
import { useVideoPageData, type VideoPageData } from '@/components/video-page/use-video-page-data';
import { VideoComments } from '@/components/video-page/VideoComments';
import { useThemeColor, useUpdateVideoProgress, type VideoPost } from '@/shared';
import type { DownloadedVideo } from '@/utils/download-library';
import { playerPageLayout } from '@/utils/player-page-layout';
import { buildVideoSource, downloadedVideoSource } from '@/utils/stream-source';

type PlayerPage = ReturnType<typeof usePlayerPage>;

/** The post's fields as the API may send them (the channel and thumbnail can be missing). */
interface LoosePost {
  readonly channel?: { readonly title: string } | null;
  readonly thumbnail?: { readonly path: string } | null;
}

/** What the player and Now Playing show: from the post, else (offline) from the download. */
interface NowPlaying {
  readonly title: string;
  readonly channel: string | undefined;
  readonly artwork: string | undefined;
}

function nowPlaying(
  post: VideoPost | undefined,
  download: DownloadedVideo | undefined,
): NowPlaying | undefined {
  if (post !== undefined) {
    const loose: LoosePost = post;
    return { title: post.title, channel: loose.channel?.title, artwork: loose.thumbnail?.path };
  }
  return download && { title: download.title, channel: download.channel, artwork: undefined };
}

/** The downloaded file, else the stream. */
function hasSource(data: VideoPageData): boolean {
  return data.download !== undefined || hasStream(data.streamUrl);
}

function hasStream(streamUrl: string | null | undefined): streamUrl is string {
  return streamUrl !== null && streamUrl !== undefined && streamUrl !== '';
}

/**
 * The end screen: Floatplane's related posts (none: the plain ended controls). Opening one
 * replaces this page, so the finished video's page and player go away.
 */
function useSuggestedEndScreen(
  data: VideoPageData,
  page: PlayerPage,
): EndScreenRenderer | undefined {
  const router = useRouter();
  const { suggested } = data;
  if (suggested.length === 0) {
    return undefined;
  }
  return ({ replay, dismiss }) => (
    <SuggestedVideos
      videos={suggested}
      onReplay={replay}
      onDismiss={dismiss}
      onSelect={(video) => {
        page.setFullscreen(false);
        router.replace({ pathname: '/video/[id]', params: { id: video.id } });
      }}
    />
  );
}

/**
 * Saves watch progress (not offline: it couldn't reach Floatplane); the mutation also patches the
 * cached post / list progress, so reopening the video resumes here.
 */
function useSaveProgress(data: VideoPageData, id: string) {
  const { token, offline } = data;
  const { mutate: mutateProgress } = useUpdateVideoProgress(token ?? undefined);
  const canSave = !offline && token !== null && token !== undefined && token !== '';
  return useCallback(
    (seconds: number) => {
      if (canSave && id !== '') {
        mutateProgress({ id, progress: seconds });
      }
    },
    [canSave, id, mutateProgress],
  );
}

interface PlayerSlotProps {
  readonly id: string;
  readonly data: VideoPageData;
  readonly page: PlayerPage;
  readonly onSaveProgress: (seconds: number) => void;
}

/**
 * The playback identity: a download's own, so reopening the page never picks up a player that was
 * streaming the same video (e.g. from the mini player, before the download finished).
 */
function videoMedia(id: string, { title, channel }: NowPlaying, local: boolean): PlaybackMedia {
  const key = local ? `download:${id}` : `video:${id}`;
  const media: PlaybackMedia = { key, kind: 'video', id, title };
  if (channel !== undefined) {
    media.subtitle = channel;
  }
  return media;
}

/** The downloaded file when there is one (no data used), else the stream. */
function videoSource(data: VideoPageData, playing: NowPlaying): VideoSource {
  if (data.download !== undefined) {
    return downloadedVideoSource(data.download);
  }
  return buildVideoSource(data.streamUrl ?? null, data.token, {
    title: playing.title,
    artist: playing.channel,
    artwork: playing.artwork,
  });
}

function fallbackDuration(data: VideoPageData): number | undefined {
  return data.attachment?.duration ?? data.download?.durationSeconds;
}

function PlayableVideo({
  id,
  playing,
  data,
  page,
  onSaveProgress,
}: PlayerSlotProps & { readonly playing: NowPlaying }): ReactElement {
  const endScreen = useSuggestedEndScreen(data, page);
  return (
    <VideoPlayer
      source={videoSource(data, playing)}
      title={playing.title}
      initialTime={data.resume.seconds}
      fallbackDuration={fallbackDuration(data)}
      fullscreen={page.fullscreen}
      tabletop={page.tabletop}
      onFullscreenChange={page.setFullscreen}
      onBack={page.minimize}
      onSaveProgress={onSaveProgress}
      media={videoMedia(id, playing, data.download !== undefined)}
      endScreen={endScreen}
    />
  );
}

/** Not downloaded, and the delivery failed or answered without a playable variant. */
function isUnplayable({ download, delivery, streamUrl }: VideoPageData): boolean {
  if (download !== undefined) {
    return false;
  }
  return delivery.isError || (delivery.data !== undefined && !hasStream(streamUrl));
}

/** Nothing to show: the post didn't load, wasn't saved, and isn't downloaded. */
function failedToLoad({ post, postData, download }: VideoPageData): boolean {
  return postData === undefined && download === undefined && post.isError;
}

/** An image / text post (no video, nor a download). */
function imagePost({ postData, download, attachment }: VideoPageData): VideoPost | undefined {
  return download === undefined && attachment === undefined ? postData : undefined;
}

/** Whatever goes in the player slot instead of the player (errors, images, loading), if anything. */
function slotStandIn(data: VideoPageData): ReactElement | undefined {
  if (failedToLoad(data)) {
    return (
      <PlayerPlaceholder
        message="Couldn't load this video."
        onRetry={() => void data.post.refetch()}
      />
    );
  }
  const image = imagePost(data);
  if (image !== undefined) {
    return <PostImage post={image} />;
  }
  if (isUnplayable(data)) {
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
  const { data } = props;
  const standIn = slotStandIn(data);
  if (standIn !== undefined) {
    return standIn;
  }
  const playing = nowPlaying(data.postData, data.download);
  // Wait for the resume position too: the player only reads `initialTime` when it mounts.
  if (playing === undefined || !hasSource(data) || !data.resume.ready) {
    return <PlayerPlaceholder />;
  }
  return <PlayableVideo {...props} playing={playing} />;
}

export default function VideoScreen(): ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const backgroundColor = useThemeColor({}, 'background');
  const data = useVideoPageData(id);
  const page = usePlayerPage('video', id, hasSource(data));
  const { immersive } = page;
  const layout = playerPageLayout({ immersive, wide: page.wide }, insets, window);
  const saveProgress = useSaveProgress(data, id);

  return (
    <View
      testID="video-screen"
      // The page background first: immersive pages override it with black.
      style={[{ backgroundColor }, layout.page]}
    >
      <Stack.Screen options={{ gestureEnabled: !immersive }} />
      <StatusBar hidden={immersive} {...(immersive ? { style: 'light' } : {})} />
      <View testID="player-column" style={layout.player}>
        <PlayerSlot id={id} data={data} page={page} onSaveProgress={saveProgress} />
      </View>
      {immersive ? null : <VideoComments data={data} />}
    </View>
  );
}
