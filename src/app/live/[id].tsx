import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { imagePath } from '@/components/image-path';
import { LiveDetails } from '@/components/live/LiveDetails';
import { usePlaybackStore, type PlaybackStore } from '@/components/player/PlaybackSession';
import { PlayerPlaceholder } from '@/components/player/PlayerPlaceholder';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { usePlayerPage } from '@/components/player/use-player-page';
import { useLiveStreams, type CreatorLiveStream } from '@/hooks/use-live-streams';
import { useColorScheme, useSession, useThemeColor } from '@/shared';
import { playerPageLayout } from '@/utils/player-page-layout';
import { buildVideoSource } from '@/utils/stream-source';

/** After a playback error the stream is reloaded (fresh signed URL) this much later (TV app parity). */
const LIVE_RETRY_MS = 5000;
/** Breathing room below the details, on top of the safe-area inset. */
const DETAILS_BOTTOM_PADDING = 24;

/**
 * Native player errors meaning the stream's playlist is gone — the delivery API can still hand out
 * URLs for a stream that just ended, so like the TV app treat these as "not live" rather than retrying.
 */
const STREAM_MISSING = /404|not found|-1100/i;

/** A pending retry, cancelled on unmount; `mounted` tells late callbacks the page is gone. */
function useRetryTimer() {
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
    }
    timer.current = null;
  }, []);
  const schedule = useCallback((run: () => void, ms: number) => {
    timer.current = setTimeout(run, ms);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clear();
    };
  }, [clear]);
  return { mounted, clear, schedule };
}

/** A stream that stopped being live has nothing left to retry. */
function useCancelWhenNotLive(status: CreatorLiveStream['status'] | undefined, cancel: () => void) {
  useEffect(() => {
    if (status !== 'live') {
      cancel();
    }
  }, [status, cancel]);
}

function isLiveSessionOf(playback: PlaybackStore, id: string): boolean {
  const media = playback.getSnapshot()?.media;
  return media?.kind === 'live' && media.id === id;
}

/** Ends the playback session if it is this creator's live stream. */
function closeLiveSession(playback: PlaybackStore | null, id: string): void {
  if (playback !== null && isLiveSessionOf(playback, id)) {
    playback.close();
  }
}

function isStreamMissing(message: string | undefined): boolean {
  return message !== undefined && STREAM_MISSING.test(message);
}

/**
 * Reload bookkeeping for the live player. `attempt` keys the player: bumping it remounts it with
 * the latest delivery URL, after ending this stream's playback session so the remount gets a fresh
 * native player (the session key is just the creator, which the mini player reopens on). A "not
 * found" playback error marks the stream missing until the next status check (the tab bar polls) or
 * a manual retry.
 */
function useLiveReload(id: string, stream: CreatorLiveStream | undefined) {
  const playback = usePlaybackStore();
  const [attempt, setAttempt] = useState(0);
  const [missingAt, setMissingAt] = useState<number | null>(null);
  const { mounted, clear: clearRetry, schedule: scheduleRetry } = useRetryTimer();
  const checkedAt = stream?.checkedAt ?? 0;
  const refetch = stream?.refetch;
  useCancelWhenNotLive(stream?.status, clearRetry);

  const reload = useCallback(() => {
    clearRetry();
    setMissingAt(null);
    void refetch?.().finally(() => {
      // Left the page meanwhile (maybe minimized): the mini player keeps what it has.
      if (!mounted.current) {
        return;
      }
      closeLiveSession(playback, id);
      setAttempt((current) => current + 1);
    });
  }, [refetch, playback, id, clearRetry, mounted]);

  const onPlaybackError = useCallback(
    (message: string | undefined) => {
      clearRetry();
      if (isStreamMissing(message)) {
        setMissingAt(checkedAt);
      } else {
        scheduleRetry(reload, LIVE_RETRY_MS);
      }
    },
    [checkedAt, reload, clearRetry, scheduleRetry],
  );

  return {
    attempt,
    missing: missingAt !== null && missingAt === checkedAt,
    reload,
    onPlaybackError,
  };
}

/** Placeholder for a stream that was checked but has nothing to play, or null when it can play. */
function checkedPlaceholder(stream: CreatorLiveStream, reload: () => void): ReactElement | null {
  if (stream.status === 'error') {
    return <PlayerPlaceholder message="Couldn't check the stream status." onRetry={reload} />;
  }
  if (stream.status === 'offline' || stream.streamUrl === null || stream.streamUrl === '') {
    return (
      <PlayerPlaceholder
        message={`${stream.creator.title} is not live right now.`}
        onRetry={reload}
        retryLabel="Check again"
      />
    );
  }
  return null;
}

/** Placeholder for every state without a playable stream, or null when the player can mount. */
function placeholderFor(
  stream: CreatorLiveStream | undefined,
  hasCreators: boolean,
  reload: () => void,
): ReactElement | null {
  if (!hasCreators || stream?.status === 'loading') {
    return <PlayerPlaceholder />;
  }
  if (!stream) {
    return <PlayerPlaceholder message="This creator doesn't stream live on Floatplane." />;
  }
  return checkedPlaceholder(stream, reload);
}

/** The creator's stream as last checked; one whose playlist 404s is shown as offline until the next check. */
function useLiveStream(id: string) {
  const { token, creators } = useSession();
  const creator = creators?.find((candidate) => candidate.id === id);
  const [polled] = useLiveStreams(token, creator ? [creator] : undefined);
  const reloading = useLiveReload(id, polled);
  const stream: CreatorLiveStream | undefined =
    polled && reloading.missing ? { ...polled, status: 'offline', streamUrl: null } : polled;
  const placeholder = placeholderFor(stream, creators !== undefined, reloading.reload);
  return { token, stream, placeholder, ...reloading };
}

type LiveStreamState = ReturnType<typeof useLiveStream>;

function LivePlayer({
  id,
  live,
  stream,
  page,
}: Readonly<{
  id: string;
  live: LiveStreamState;
  stream: CreatorLiveStream;
  page: ReturnType<typeof usePlayerPage>;
}>): ReactElement {
  const { title } = stream.liveStream;
  const source = buildVideoSource(stream.streamUrl, live.token, {
    title,
    artist: stream.creator.title,
    artwork: imagePath(stream.liveStream.thumbnail),
  });
  return (
    <VideoPlayer
      key={live.attempt}
      live
      source={source}
      title={title}
      fullscreen={page.fullscreen}
      tabletop={page.tabletop}
      onFullscreenChange={page.setFullscreen}
      onBack={page.minimize}
      onError={live.onPlaybackError}
      // Keyed by creator: reopening from the mini player takes its player over. A reload ends the
      // session first (see useLiveReload), so the remounted player starts fresh.
      media={{ key: `live:${id}`, kind: 'live', id, title, subtitle: stream.creator.title }}
      onRetry={live.reload}
    />
  );
}

function LiveDetailsPane({ stream }: Readonly<{ stream: CreatorLiveStream }>): ReactElement {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + DETAILS_BOTTOM_PADDING },
      ]}
      indicatorStyle={colorScheme === 'dark' ? 'white' : 'default'}
    >
      <LiveDetails stream={stream} />
    </ScrollView>
  );
}

/**
 * The placeholder has no controls (no exit-fullscreen button), so a stream ending mid-watch
 * mustn't strand the viewer in fullscreen.
 */
function useLeaveFullscreenWhenUnplayable(
  playable: boolean,
  page: ReturnType<typeof usePlayerPage>,
) {
  const { fullscreen, setFullscreen } = page;
  useEffect(() => {
    if (!playable && fullscreen) {
      setFullscreen(false);
    }
  }, [playable, fullscreen, setFullscreen]);
}

function playerSlot(
  id: string,
  live: LiveStreamState,
  page: ReturnType<typeof usePlayerPage>,
): ReactElement | null {
  if (live.placeholder !== null) {
    return live.placeholder;
  }
  return live.stream ? <LivePlayer id={id} live={live} stream={live.stream} page={page} /> : null;
}

/** Live player page: a creator's livestream with the live player and the stream details below. */
export default function LiveScreen(): ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const backgroundColor = useThemeColor({}, 'background');
  const live = useLiveStream(id);
  const playable = live.placeholder === null;
  const page = usePlayerPage('live', id, playable);
  const { immersive } = page;
  const layout = playerPageLayout({ immersive, wide: page.wide }, insets, window);
  useLeaveFullscreenWhenUnplayable(playable, page);

  return (
    <View
      testID="live-screen"
      // The page background first: immersive pages override it with black.
      style={[{ backgroundColor }, layout.page]}
    >
      <Stack.Screen options={{ gestureEnabled: !immersive }} />
      <StatusBar hidden={immersive} {...(immersive ? { style: 'light' } : {})} />
      <View testID="player-column" style={layout.player}>
        {playerSlot(id, live, page)}
      </View>
      {immersive || !live.stream ? null : <LiveDetailsPane stream={live.stream} />}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
  },
});
