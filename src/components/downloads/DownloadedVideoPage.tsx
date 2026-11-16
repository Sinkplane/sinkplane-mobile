import { useEffect, type ReactElement } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useNavigation } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { VideoSource } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DownloadedVideoDetails } from '@/components/downloads/DownloadedVideoDetails';
import { useGoBack } from '@/components/downloads/ScreenHeader';
import { usePlaybackStore } from '@/components/player/PlaybackSession';
import { PlayerPlaceholder } from '@/components/player/PlayerPlaceholder';
import { usePlayerPage, type PlayerPage } from '@/components/player/use-player-page';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { useDownloadedVideo } from '@/hooks/use-video-download';
import { useThemeColor } from '@/shared';
import {
  downloadedThumbnailUri,
  downloadedVideoUri,
  type DownloadedVideo,
} from '@/utils/download-library';
import { playerPageLayout } from '@/utils/player-page-layout';

/** The local file, labelled for the lock screen / Now Playing (artwork: the saved thumbnail). */
function downloadedVideoSource(video: DownloadedVideo): VideoSource {
  const artwork = downloadedThumbnailUri(video);
  return {
    uri: downloadedVideoUri(video),
    metadata: {
      title: video.title,
      ...(video.channel === undefined ? {} : { artist: video.channel }),
      ...(artwork === undefined ? {} : { artwork }),
    },
  };
}

/** Immersive (fullscreen / tabletop): no back swipe, it would fight the player's gestures. */
function useBackGesture(enabled: boolean): void {
  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: enabled });
  }, [navigation, enabled]);
}

/**
 * The offline player plays outside the app's playback session (the mini player can only reopen
 * streamed pages), so opening it stops whatever the mini player was playing.
 */
function useStopOtherPlayback(): void {
  const store = usePlaybackStore();
  useEffect(() => {
    store?.close();
  }, [store]);
}

interface PlayerProps {
  readonly video: DownloadedVideo;
  readonly page: PlayerPage;
  readonly onBack: () => void;
}

function DownloadedPlayer({ video, page, onBack }: PlayerProps): ReactElement {
  return (
    <VideoPlayer
      source={downloadedVideoSource(video)}
      title={video.title}
      fallbackDuration={video.durationSeconds}
      fullscreen={page.fullscreen}
      tabletop={page.tabletop}
      onFullscreenChange={page.setFullscreen}
      onBack={onBack}
    />
  );
}

/** A downloaded video's page: the player on the local file (works offline) and its details. */
export function DownloadedVideoPage({ id }: Readonly<{ id: string }>): ReactElement {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const backgroundColor = useThemeColor({}, 'background');
  const goBack = useGoBack();
  const video = useDownloadedVideo(id);
  const page = usePlayerPage('video', undefined, video !== undefined);
  const { immersive } = page;
  const layout = playerPageLayout({ immersive, wide: page.wide }, insets, window);
  useStopOtherPlayback();
  useBackGesture(!immersive);

  return (
    <View testID="downloaded-video-screen" style={[{ backgroundColor }, layout.page]}>
      <StatusBar hidden={immersive} {...(immersive ? { style: 'light' } : {})} />
      <View testID="player-column" style={layout.player}>
        {video === undefined ? (
          <PlayerPlaceholder
            message="This download isn't on this device anymore."
            onRetry={goBack}
            retryLabel="Back"
          />
        ) : (
          <DownloadedPlayer video={video} page={page} onBack={goBack} />
        )}
      </View>
      {immersive || video === undefined ? null : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom }}>
          <DownloadedVideoDetails video={video} onDeleted={goBack} />
        </ScrollView>
      )}
    </View>
  );
}
