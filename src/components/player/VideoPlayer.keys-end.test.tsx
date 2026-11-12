import { Pressable, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { mockVideoPlayerState, type MockVideoPlayer } from '@test/mocks/expo-video';

import type { EndScreenActions } from '@/components/player/use-end-screen';
import { VideoPlayer } from '@/components/player/VideoPlayer';

const SOURCE = { uri: 'https://edge.floatplane.test/guid/1080.m3u8', contentType: 'hls' as const };

type ExtraProps = Partial<Parameters<typeof VideoPlayer>[0]>;

async function renderPlayer(props: ExtraProps = {}): Promise<MockVideoPlayer> {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
      }}
    >
      <VideoPlayer
        source={SOURCE}
        title="Test Video"
        fullscreen={false}
        onFullscreenChange={jest.fn()}
        onBack={jest.fn()}
        {...props}
      />
    </SafeAreaProvider>,
  );
  const player = mockVideoPlayerState.lastPlayer();
  await act(() => {
    player.setStatus('readyToPlay');
  });
  return player;
}

const playToEnd = (player: MockVideoPlayer) =>
  act(() => {
    player.emit('playToEnd');
  });

const pressSpace = () => fireEvent(screen.getByTestId('space-key-listener'), 'space');

/** A stand-in end screen exposing its two actions as buttons. */
function TestEndScreen({ replay, dismiss }: Readonly<EndScreenActions>) {
  return (
    <>
      <Text testID="end-screen">Up next</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="End replay" onPress={replay} />
      <Pressable accessibilityRole="button" accessibilityLabel="End close" onPress={dismiss} />
    </>
  );
}

const endScreen = (actions: EndScreenActions) => <TestEndScreen {...actions} />;

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('VideoPlayer hardware keyboard', () => {
  it("plays and pauses from the space bar, and replays once the video's ended", async () => {
    const player = await renderPlayer();
    expect(player.play).toHaveBeenCalledTimes(1); // autoplay

    await pressSpace();
    expect(player.pause).toHaveBeenCalledTimes(1);
    await pressSpace();
    expect(player.play).toHaveBeenCalledTimes(2);

    await playToEnd(player);
    await pressSpace();
    expect(player.replay).toHaveBeenCalledTimes(1);
  });

  it('lets go of the keyboard while the speed menu is open', async () => {
    await renderPlayer();
    expect(screen.getByTestId('space-key-listener')).not.toBeDisabled();

    await fireEvent.press(screen.getByRole('button', { name: /Playback speed/u }));
    expect(screen.getByTestId('space-key-listener')).toBeDisabled();
  });
});

describe('VideoPlayer end screen', () => {
  it('takes the middle of the controls when the video ends, keeping the top and bottom bars', async () => {
    const player = await renderPlayer({ endScreen });
    expect(screen.queryByTestId('end-screen')).toBeNull();

    await playToEnd(player);
    expect(screen.getByTestId('end-screen')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close video' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enter fullscreen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Playback speed/u })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Replay' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back 15 seconds' })).toBeNull();
  });

  it('steps aside until the next ending when closed; its Replay restarts the video', async () => {
    const player = await renderPlayer({ endScreen });
    await playToEnd(player);

    await fireEvent.press(screen.getByRole('button', { name: 'End close' }));
    expect(screen.queryByTestId('end-screen')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Replay' }));
    expect(player.replay).toHaveBeenCalledTimes(1);

    await playToEnd(player);
    expect(screen.getByTestId('end-screen')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'End replay' }));
    expect(player.replay).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('end-screen')).toBeNull();
  });

  it('covers the video half in tabletop, leaving the panel controls below the hinge', async () => {
    const player = await renderPlayer({ endScreen, tabletop: { hingeTop: 300, hingeBottom: 320 } });
    await playToEnd(player);
    expect(screen.getByTestId('end-screen')).toBeTruthy();
    expect(screen.getByTestId('player-tabletop-panel')).toBeTruthy();
  });

  it('never shows for a live stream', async () => {
    const live = await renderPlayer({ endScreen, live: true });
    await playToEnd(live);
    expect(screen.queryByTestId('end-screen')).toBeNull();
  });

  it('hides while the video plays in picture-in-picture', async () => {
    const player = await renderPlayer({ endScreen });
    await act(() => {
      (
        screen.getByTestId('video-view').props as { onPictureInPictureStart: () => void }
      ).onPictureInPictureStart();
    });
    await playToEnd(player);
    expect(screen.queryByTestId('end-screen')).toBeNull();
  });
});
