import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type GestureResponderHandlers,
} from 'react-native';
import { useEvent } from 'expo';
import { usePathname, useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePlaybackSession, usePlaybackStore, type PlaybackSession } from '@/components/player/PlaybackSession';
import { useWatchProgress } from '@/hooks/use-watch-progress';
import { useSession, useUpdateVideoProgress } from '@/shared';
import {
  cornerOffset,
  DEFAULT_CORNER,
  MINI_PLAYER_MARGIN,
  miniPlayerSize,
  nearestCorner,
  type Corner,
  type Edges,
  type Size,
} from '@/utils/mini-player-layout';

/** Room for the tab bar under the tile's bottom corners (the overlay sits above the tab navigator). */
const TAB_BAR_CLEARANCE = Platform.OS === 'ios' ? 64 : 80;

/** Movement before a touch on the tile counts as a drag rather than a tap. */
const DRAG_SLOP = 8;

const ICONS = {
  play: { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' },
  pause: { ios: 'pause.fill', android: 'pause', web: 'pause' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
} satisfies Record<string, SymbolViewProps['name']>;

/** The page routes that show the player themselves (the mini player hides there). */
export function isPlayerRoute(pathname: string) {
  return pathname.startsWith('/video/') || pathname.startsWith('/live/');
}

/**
 * Drag the tile anywhere; on release it springs into the corner it was dropped (or flung) towards.
 * Taps on the tile's buttons still go through: the responder only captures once the touch moves.
 */
export function useCornerDrag(window: Size, tile: Size, edges: Edges) {
  const [corner, setCorner] = useState<Corner>(DEFAULT_CORNER);
  const offset = cornerOffset(corner, window, tile, edges);
  const [position] = useState(() => new Animated.ValueXY(offset));

  const springTo = (target: { x: number; y: number }) => {
    Animated.spring(position, { toValue: target, useNativeDriver: false, bounciness: 4 }).start();
  };

  // Follows corner changes and window resizes (unfolding a foldable, split screen).
  useEffect(() => {
    springTo(offset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset.x, offset.y]);

  const handlers: GestureResponderHandlers = useMemo(() => {
    const release = (dx: number, dy: number, vx: number, vy: number) => {
      const next = nearestCorner({ x: offset.x + dx, y: offset.y + dy }, { x: vx, y: vy }, window, tile);
      springTo(cornerOffset(next, window, tile, edges));
      setCorner(next);
    };
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, { dx, dy }) => Math.abs(dx) > DRAG_SLOP || Math.abs(dy) > DRAG_SLOP,
      onPanResponderMove: (_event, { dx, dy }) => position.setValue({ x: offset.x + dx, y: offset.y + dy }),
      onPanResponderRelease: (_event, { dx, dy, vx, vy }) => release(dx, dy, vx, vy),
      onPanResponderTerminate: (_event, { dx, dy, vx, vy }) => release(dx, dy, vx, vy),
    }).panHandlers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset.x, offset.y, window.width, window.height, tile.width, tile.height, edges.top, edges.bottom, edges.left, edges.right]);

  return { corner, position, handlers };
}

/** Keeps saving watch progress while a video plays in the mini player (live streams have none). */
function useMiniPlayerProgress({ media, player }: PlaybackSession) {
  const { token } = useSession();
  const { mutate } = useUpdateVideoProgress(token ?? undefined);
  const save = media.kind === 'video' && token ? (seconds: number) => mutate({ id: media.id, progress: seconds }) : undefined;
  // A player minimized while still loading resumes here; a started one just keeps saving.
  useWatchProgress(player, media.resumeAt, save);
}

function MiniButton({ icon, label, onPress }: { icon: SymbolViewProps['name']; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <SymbolView name={icon} size={18} tintColor="#fff" />
    </Pressable>
  );
}

function MiniPlayerTile({ session }: { session: PlaybackSession }) {
  const { media, player } = session;
  const store = usePlaybackStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  useMiniPlayerProgress(session);

  const tile = miniPlayerSize(window.width);
  const edges: Edges = {
    top: insets.top + MINI_PLAYER_MARGIN,
    bottom: insets.bottom + TAB_BAR_CLEARANCE + MINI_PLAYER_MARGIN,
    left: insets.left + MINI_PLAYER_MARGIN,
    right: insets.right + MINI_PLAYER_MARGIN,
  };
  const drag = useCornerDrag(window, tile, edges);

  const expand = () => {
    if (media.kind === 'live') router.push({ pathname: '/live/[id]', params: { id: media.id } });
    else router.push({ pathname: '/video/[id]', params: { id: media.id } });
  };

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
      <View style={styles.buttons} pointerEvents="box-none">
        <MiniButton
          icon={isPlaying ? ICONS.pause : ICONS.play}
          label={isPlaying ? 'Pause' : 'Play'}
          onPress={() => (isPlaying ? player.pause() : player.play())}
        />
        <MiniButton icon={ICONS.close} label="Close mini player" onPress={() => store?.close()} />
      </View>
    </Animated.View>
  );
}

/**
 * YouTube-style floating player: after the player page's close arrow, the video keeps playing in a
 * draggable tile (top-right by default) over the rest of the app. Tap it to reopen the page (same
 * player, no reload); ✕ stops playback. Hidden on the player pages themselves.
 */
export function MiniPlayer() {
  const session = usePlaybackSession();
  const pathname = usePathname();
  if (!session?.minimized || isPlayerRoute(pathname)) return null;
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
