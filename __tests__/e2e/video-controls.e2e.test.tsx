/**
 * E2E: the video page's custom player controls — play/pause/replay, skips, double-tap, hold for
 * 2×, the speed menu, the seek bar, and picture-in-picture.
 */
import { loadRuntime, type Runtime } from './helpers/runtime';
import { defined, openVideo, player, readyToPlay, untilPlayable } from './helpers/video-page';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

describe('player interactions', () => {
  beforeEach(async () => {
    await openVideo(rt);
    await untilPlayable(rt);
    await readyToPlay(rt); // autoplay: resume → play
  });

  it('pauses and resumes from the center button, and replays after the end', async () => {
    await rt.until(() => {
      expect(rt.screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    });

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Pause' }));
    await rt.until(() => {
      expect(rt.screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    });
    expect(player(rt).pause).toHaveBeenCalled();

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Play' }));
    await rt.until(() => {
      expect(rt.screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    });

    await rt.act(() => {
      player(rt).emit('playToEnd');
    });
    await rt.until(() => {
      expect(rt.screen.getByRole('button', { name: 'Replay' })).toBeTruthy();
    });
    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Replay' }));
    expect(player(rt).replay).toHaveBeenCalled();
    await rt.until(() => {
      expect(rt.screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    });
  });

  it('skips ±15 seconds from the control buttons', async () => {
    player(rt).currentTime = 100;
    player(rt).duration = 600;

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Back 15 seconds' }));
    expect(player(rt).seeks.at(-1)).toBe(85);
    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Forward 15 seconds' }));
    expect(player(rt).seeks.at(-1)).toBe(100);
  });

  it('double-taps a side of the video to skip, showing the bubble', async () => {
    player(rt).currentTime = 100;
    player(rt).duration = 600;
    const surface = rt.screen.getByTestId('player-gesture-surface');
    await rt.fireEvent.layout(surface, { width: 300, height: 170 }); // left half is x < 150

    await rt.fireEvent.press(surface, { nativeEvent: { locationX: 60 } });
    await rt.fireEvent.press(surface, { nativeEvent: { locationX: 80 } });
    await rt.until(() => {
      expect(rt.screen.getByTestId('seek-feedback-back')).toHaveTextContent('−15s');
    });
    expect(player(rt).seeks.at(-1)).toBe(85);

    await rt.fireEvent.press(surface, { nativeEvent: { locationX: 240 } });
    await rt.fireEvent.press(surface, { nativeEvent: { locationX: 260 } });
    await rt.until(() => {
      expect(rt.screen.getByTestId('seek-feedback-forward')).toHaveTextContent('+15s');
    });
    expect(player(rt).seeks.at(-1)).toBe(100);

    await rt.advanceTime(700);
    expect(rt.screen.queryByTestId('seek-feedback-forward')).toBeNull();
  });

  it('plays at 2× while the video is pressed and held', async () => {
    const surface = rt.screen.getByTestId('player-gesture-surface');

    await rt.fireEvent(surface, 'longPress');
    await rt.until(() => {
      expect(rt.screen.getByTestId('hold-speed-badge')).toBeTruthy();
    });
    expect(player(rt).playbackRate).toBe(2);

    await rt.fireEvent(surface, 'pressOut');
    await rt.until(() => {
      expect(rt.screen.queryByTestId('hold-speed-badge')).toBeNull();
    });
    expect(player(rt).playbackRate).toBe(1);
  });

  it('changes and persists the playback speed from the menu', async () => {
    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Playback speed Normal' }));
    await rt.until(() => {
      expect(rt.screen.getByTestId('speed-option-1.5')).toBeTruthy();
    });

    await rt.fireEvent.press(rt.screen.getByTestId('speed-option-1.5'));
    await rt.until(() => {
      expect(rt.screen.getByRole('button', { name: 'Playback speed 1.5×' })).toBeTruthy();
    });
    expect(player(rt).playbackRate).toBe(1.5);
    expect(rt.secureStore.get('playbackSpeed')).toBe('1.5');
  });

  it('scrubs the seek bar to a position', async () => {
    player(rt).duration = 600;
    const bar = rt.screen.getByTestId('player-seek-bar');
    await rt.fireEvent.layout(bar, { width: 200, height: 28 });

    await rt.fireEvent(bar, 'responderGrant', { nativeEvent: { locationX: 100 } });
    await rt.fireEvent(bar, 'responderMove', { nativeEvent: { locationX: 150 } });
    await rt.until(() => {
      expect(rt.screen.getByTestId('player-time')).toHaveTextContent('7:30 / 10:00');
    }); // under the finger

    await rt.fireEvent(bar, 'responderRelease', { nativeEvent: { locationX: 150 } });
    expect(player(rt).seeks.at(-1)).toBe(450); // 150 / 200 * 600s
  });

  it('drops the custom controls while in picture-in-picture', async () => {
    const view = () => defined(rt.mockVideoPlayerState.viewProps, 'the video view');
    await rt.act(() => {
      view().onPictureInPictureStart?.();
    });
    await rt.until(() => {
      expect(rt.screen.queryByTestId('player-controls')).toBeNull();
    });

    await rt.act(() => {
      view().onPictureInPictureStop?.();
    });
    await rt.until(() => {
      expect(rt.screen.getByTestId('player-controls')).toBeTruthy();
    });
  });
});
