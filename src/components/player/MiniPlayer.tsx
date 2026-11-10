import { Animated, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useEvent } from 'expo';
import { usePathname, useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { VideoView, type VideoPlayer } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  usePlaybackSession,
  usePlaybackStore,
  type PlaybackMedia,
  type PlaybackSession,
} from '@/components/player/PlaybackSession';
import { useCornerDrag } from '@/components/player/use-corner-drag';
import { useWatchProgress } from '@/hooks/use-watch-progress';
import { useSession, useUpdateVideoProgress } from '@/shared';
import { MINI_PLAYER_MARGIN, miniPlayerSize, type Edges } from '@/utils/mini-player-layout';

const IOS_TAB_BAR_CLEARANCE = 64;
const ANDROID_TAB_BAR_CLEARANCE = 80;

/** Room for the tab bar under the tile's bottom corners (the overlay sits above the tab navigator). */
const TAB_BAR_CLEARANCE = Platform.OS === 'ios' ? IOS_TAB_BAR_CLEARANCE : ANDROID_TAB_BAR_CLEARANCE;

const BUTTON_HIT_SLOP = 6;
const BUTTON_ICON_SIZE = 18;

const ICONS = {
  play: { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' },
  pause: { ios: 'pause.fill', android: 'pause', web: 'pause' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
} satisfies Record<string, SymbolViewProps['name']>;

/** The page routes that show the player themselves (the mini player hides there). */
export function isPlayerRoute(pathname: string): boolean {
  return pathname.startsWith('/video/') || pathname.startsWith('/live/');
}

/** Keeps saving watch progress while a video plays in the mini player (live streams have none). */
function useMiniPlayerProgress({ media, player }: PlaybackSession) {
  const { token } = useSession();
  const { mutate } = useUpdateVideoProgress(token ?? undefined);
  const save =
    media.kind === 'video' && token !== undefined && token !== null && token !== ''
      ? (seconds: number) => {
          mutate({ id: media.id, progress: seconds });
        }
      : undefined;
  // A player minimized while still loading resumes here; a started one just keeps saving.
  useWatchProgress(player, { initialTime: media.resumeAt, save });
}

/** Distances the tile keeps from the window edges: safe area, tab bar and a margin. */
function useTileEdges(): Edges {
  const insets = useSafeAreaInsets();
  return {
    top: insets.top + MINI_PLAYER_MARGIN,
    bottom: insets.bottom + TAB_BAR_CLEARANCE + MINI_PLAYER_MARGIN,
    left: insets.left + MINI_PLAYER_MARGIN,
    right: insets.right + MINI_PLAYER_MARGIN,
  };
}

/** Reopens the media's player page. */
function useExpand(media: PlaybackMedia): () => void {
  const router = useRouter();
  return () => {
    if (media.kind === 'live') {
      router.push({ pathname: '/live/[id]', params: { id: media.id } });
    } else {
      router.push({ pathname: '/video/[id]', params: { id: media.id } });
    }
  };
}

function MiniButton({
  icon,
  label,
  onPress,
}: Readonly<{
  icon: SymbolViewProps['name'];
  label: string;
  onPress: () => void;
}>) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={BUTTON_HIT_SLOP}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <SymbolView name={icon} size={BUTTON_ICON_SIZE} tintColor="#fff" />
    </Pressable>
  );
}

/** Play/pause and close, over the tile's top corners. */
function MiniButtons({ player }: Readonly<{ player: VideoPlayer }>) {
  const store = usePlaybackStore();
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  return (
    <View style={styles.buttons} pointerEvents="box-none">
      <MiniButton
        icon={isPlaying ? ICONS.pause : ICONS.play}
        label={isPlaying ? 'Pause' : 'Play'}
        onPress={() => {
          if (isPlaying) {
            player.pause();
          } else {
            player.play();
          }
        }}
      />
      <MiniButton icon={ICONS.close} label="Close mini player" onPress={() => store?.close()} />
    </View>
  );
}

function MiniPlayerTile({ session }: Readonly<{ session: PlaybackSession }>) {
  const { media, player } = session;
  const window = useWindowDimensions();
  useMiniPlayerProgress(session);
  const tile = miniPlayerSize(window.width);
  const drag = useCornerDrag({ window, tile, edges: useTileEdges() });
  const expand = useExpand(media);

  return (
    <Animated.View
      testID="mini-player"
      accessibilityLabel={`Mini player, corner ${drag.corner}`}
      style={[styles.tile, tile, { transform: drag.position.getTranslateTransform() }]}
      {...drag.handlers}
    >
      <VideoView
        testID="mini-player-video"
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
        allowsPictureInPicture
        startsPictureInPictureAutomatically
      />
      <Pressable
        testID="mini-player-expand"
        style={StyleSheet.absoluteFill}
        onPress={expand}
        accessibilityRole="button"
        accessibilityLabel={`Open ${media.title ?? 'video'}`}
      />
      <MiniButtons player={player} />
    </Animated.View>
  );
}

/**
 * YouTube-style floating player: after the player page's close arrow, the video keeps playing in a
 * draggable tile (top-right by default) over the rest of the app. Tap it to reopen the page (same
 * player, no reload); ✕ stops playback. Hidden on the player pages themselves.
 */
export function MiniPlayer(): React.JSX.Element | null {
  const session = usePlaybackSession();
  const pathname = usePathname();
  if (session?.minimized !== true || isPlayerRoute(pathname)) {
    return null;
  }
  return <MiniPlayerTile key={session.media.key} session={session} />;
}

const styles = StyleSheet.create({
  tile: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#000',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  buttons: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 4,
  },
  button: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  pressed: {
    opacity: 0.6,
  },
});
