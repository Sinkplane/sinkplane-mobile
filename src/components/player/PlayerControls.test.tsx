import { fireEvent, render, screen } from '@testing-library/react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayerControls } from '@/components/player/PlayerControls';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: jest.fn(),
}));

const mockedInsets = jest.mocked(useSafeAreaInsets);

async function renderControls(props: Partial<Parameters<typeof PlayerControls>[0]> = {}) {
  await render(
    <PlayerControls
      playing={false}
      ended={false}
      currentTime={95}
      duration={100}
      bufferedPosition={98}
      rate={1}
      fullscreen={false}
      onTogglePlay={jest.fn()}
      onSkip={jest.fn()}
      onSeek={jest.fn()}
      onScrub={jest.fn()}
      onOpenSpeedMenu={jest.fn()}
      onToggleFullscreen={jest.fn()}
      {...props}
    />,
  );
}

describe('PlayerControls', () => {
  beforeEach(() => {
    mockedInsets.mockReturnValue({ top: 59, bottom: 83, left: 0, right: 0 });
  });

  it('renders the time as current / duration and the seek bar', async () => {
    await renderControls();

    expect(screen.getByTestId('player-controls')).toBeTruthy();
    expect(screen.getByTestId('player-time')).toHaveTextContent('1:35 / 1:40');
    expect(screen.getByTestId('player-seek-bar')).toBeTruthy();
  });

  it('shows the title only in fullscreen', async () => {
    await renderControls({ title: 'Big Buck Bunny', fullscreen: true });
    expect(screen.getByText('Big Buck Bunny')).toBeTruthy();

    await renderControls({ title: 'Big Buck Bunny' });
    expect(screen.queryByText('Big Buck Bunny')).toBeNull();
  });

  it('plays, pauses and replays through the center button', async () => {
    const onTogglePlay = jest.fn();
    await renderControls({ onTogglePlay });

    const play = screen.getByRole('button', { name: 'Play' });
    await fireEvent.press(play);
    expect(onTogglePlay).toHaveBeenCalledTimes(1);

    await renderControls({ playing: true, onTogglePlay });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();

    await renderControls({ ended: true, onTogglePlay });
    expect(screen.getByRole('button', { name: 'Replay' })).toBeTruthy();
  });

  it('skips 15 seconds back and forward', async () => {
    const onSkip = jest.fn();
    await renderControls({ onSkip });

    await fireEvent.press(screen.getByRole('button', { name: 'Back 15 seconds' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Forward 15 seconds' }));

    expect(onSkip).toHaveBeenNthCalledWith(1, -15);
    expect(onSkip).toHaveBeenNthCalledWith(2, 15);
  });

  it('opens the speed menu, showing the active rate', async () => {
    const onOpenSpeedMenu = jest.fn();
    await renderControls({ rate: 1.5, onOpenSpeedMenu });

    expect(screen.getByRole('button', { name: 'Playback speed 1.5×' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Playback speed 1.5×' }));
    expect(onOpenSpeedMenu).toHaveBeenCalledTimes(1);
  });

  it('toggles in and out of fullscreen', async () => {
    const onToggleFullscreen = jest.fn();
    await renderControls({ onToggleFullscreen });

    await fireEvent.press(screen.getByRole('button', { name: 'Enter fullscreen' }));
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);

    await renderControls({ fullscreen: true, onToggleFullscreen });
    await fireEvent.press(screen.getByRole('button', { name: 'Exit fullscreen' }));
    expect(onToggleFullscreen).toHaveBeenCalledTimes(2);
  });

  it('shows a close button only when it can go back', async () => {
    const onBack = jest.fn();
    await renderControls({ onBack });

    await fireEvent.press(screen.getByRole('button', { name: 'Close video' }));
    expect(onBack).toHaveBeenCalledTimes(1);

    await renderControls();
    expect(screen.queryByRole('button', { name: 'Close video' })).toBeNull();
  });
});
