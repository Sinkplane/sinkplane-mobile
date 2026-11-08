import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiveDetails } from '@/components/live/LiveDetails';
import { PlayerPlaceholder } from '@/components/player/PlayerPlaceholder';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { usePlayerPage } from '@/hooks/use-player-page';
import { useLiveStreams, type CreatorLiveStream } from '@/hooks/use-live-streams';
import { useColorScheme, useSession, useThemeColor } from '@/shared';
import { buildVideoSource } from '@/utils/stream-source';

/** After a playback error the stream is reloaded (fresh signed URL) this much later (TV app parity). */
const LIVE_RETRY_MS = 5000;

/**
 * Native player errors meaning the stream's playlist is gone — the delivery API can still hand out
 * URLs for a stream that just ended, so like the TV app treat these as "not live" rather than retrying.
 */
const STREAM_MISSING = /404|not found|-1100/i;

/**
 * Reload bookkeeping for the live player. `attempt` keys the player: bumping it remounts it with
 * the latest delivery URL. A "not found" playback error marks the stream missing until the next
 * status check (the tab bar polls) or a manual retry.
 */
function useLiveReload(stream: CreatorLiveStream | undefined) {
  const [attempt, setAttempt] = useState(0);
  const [missingAt, setMissingAt] = useState<number | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkedAt = stream?.checkedAt ?? 0;
  const refetch = stream?.refetch;

  const clearRetry = () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
  };
  useEffect(() => clearRetry, []);
  const status = stream?.status;
  useEffect(() => {
    if (status !== 'live') clearRetry();
  }, [status]);

  const reload = useCallback(() => {
    clearRetry();
    setMissingAt(null);
    void refetch?.().finally(() => setAttempt(current => current + 1));
  }, [refetch]);

  const onPlaybackError = useCallback(
    (message: string | undefined) => {
      clearRetry();
      if (message && STREAM_MISSING.test(message)) setMissingAt(checkedAt);
      else retryTimer.current = setTimeout(reload, LIVE_RETRY_MS);
    },
    [checkedAt, reload],
  );

  return { attempt, missing: missingAt !== null && missingAt === checkedAt, reload, onPlaybackError };
}

/** Placeholder for every state without a playable stream, or null when the player can mount. */
function placeholderFor(stream: CreatorLiveStream | undefined, hasCreators: boolean, reload: () => void) {
  if (!hasCreators || stream?.status === 'loading') return <PlayerPlaceholder />;
  if (!stream) return <PlayerPlaceholder message="This creator doesn't stream live on Floatplane." />;
  if (stream.status === 'error') return <PlayerPlaceholder message="Couldn't check the stream status." onRetry={reload} />;
  if (stream.status === 'offline' || !stream.streamUrl) {
    return <PlayerPlaceholder message={`${stream.creator.title} is not live right now.`} onRetry={reload} retryLabel="Check again" />;
  }
  return null;
}

/** Live player page: a creator's livestream with the live player and the stream details below. */
export default function LiveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const colorScheme = useColorScheme();
  const { token, creators } = useSession();

  const creator = creators?.find(candidate => candidate.id === id);
  const [polled] = useLiveStreams(token, creator ? [creator] : undefined);
  const { attempt, missing, reload, onPlaybackError } = useLiveReload(polled);
  // A stream whose playlist 404s is shown as offline until the next status check.
  const stream: CreatorLiveStream | undefined = polled && missing ? { ...polled, status: 'offline', streamUrl: null } : polled;

  const placeholder = placeholderFor(stream, !!creators, reload);
  const playable = !placeholder;
  const { fullscreen, setFullscreen, tabletop, immersive, minimize } = usePlayerPage('live', id, playable);

  // The placeholder has no controls (no exit-fullscreen button), so a stream ending mid-watch
  // mustn't strand the viewer in fullscreen.
  useEffect(() => {
    if (!playable && fullscreen) setFullscreen(false);
  }, [playable, fullscreen, setFullscreen]);

  return (
    <View
      testID="live-screen"
      style={[styles.container, { backgroundColor, paddingTop: immersive ? 0 : insets.top }, immersive && styles.fullscreen]}
    >
      <Stack.Screen options={{ gestureEnabled: !immersive }} />
      <StatusBar hidden={immersive} style={immersive ? 'light' : undefined} />
      {placeholder ??
        (stream ? (
          <VideoPlayer
            key={attempt}
            live
            source={buildVideoSource(stream.streamUrl, token, {
              title: stream.liveStream.title,
              artist: stream.creator.title,
              artwork: stream.liveStream.thumbnail?.path,
            })}
            title={stream.liveStream.title}
            fullscreen={fullscreen}
            tabletop={tabletop}
            onFullscreenChange={setFullscreen}
            onBack={minimize}
            onError={onPlaybackError}
            // Each reload attempt (fresh signed URL) is a new playback. Reopening from the mini player
            // reuses its player only while the key still matches (no reload happened since).
            media={{
              key: `live:${id}:${attempt}:${stream.streamUrl}`,
              kind: 'live',
              id,
              title: stream.liveStream.title,
              subtitle: stream.creator.title,
            }}
            onRetry={reload}
          />
        ) : null)}
      {immersive || !stream ? null : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          indicatorStyle={colorScheme === 'dark' ? 'white' : 'default'}
        >
          <LiveDetails stream={stream} />
        </ScrollView>
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
  content: {
    paddingHorizontal: 16,
  },
});
