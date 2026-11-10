import { StyleSheet, type ViewProps } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { SeekBar } from '@/components/player/SeekBar';

/** The responder probes the tests call directly (RN passes them an event the bar ignores). */
interface ResponderProbes {
  onStartShouldSetResponder: () => boolean;
  onMoveShouldSetResponder: () => boolean;
}

const viewProps = (testID: string) => screen.getByTestId(testID).props as ViewProps;
const widthOf = (testID: string) => StyleSheet.flatten(viewProps(testID).style)?.width;

/** Lay the bar out at `width` px so locationX → time math can run. */
async function renderSeekbar(props: Partial<Parameters<typeof SeekBar>[0]> = {}) {
  await render(
    <SeekBar
      currentTime={30}
      duration={100}
      bufferedPosition={60}
      onSeek={jest.fn()}
      onScrub={jest.fn()}
      {...props}
    />,
  );
  await fireEvent.layout(screen.getByTestId('player-seek-bar'), { width: 200, height: 28 });
}

describe('SeekBar', () => {
  it('draws the played and buffered progress as percentages', async () => {
    await renderSeekbar();
    expect(widthOf('player-seek-progress')).toBe('30%');
  });

  it('scrubs to the finger position and seeks on release', async () => {
    const onSeek = jest.fn();
    const onScrub = jest.fn();
    await renderSeekbar({ onSeek, onScrub });

    const bar = screen.getByTestId('player-seek-bar');
    await fireEvent(bar, 'responderGrant', { nativeEvent: { locationX: 100 } }); // 50%
    expect(onScrub).toHaveBeenCalledWith(50);
    expect(screen.getByTestId('player-seek-progress')).toBeTruthy(); // still rendered while scrubbing
    expect(widthOf('player-seek-progress')).toBe('50%');

    await fireEvent(bar, 'responderMove', { nativeEvent: { locationX: 150 } }); // 75%
    expect(onScrub).toHaveBeenLastCalledWith(75);

    await fireEvent(bar, 'responderRelease', { nativeEvent: { locationX: 150 } });
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledWith(75);
    expect(onScrub).toHaveBeenLastCalledWith(null); // scrubbing ended
  });

  it('clamps scrubs outside the bar', async () => {
    const onSeek = jest.fn();
    await renderSeekbar({ onSeek });

    const bar = screen.getByTestId('player-seek-bar');
    await fireEvent(bar, 'responderGrant', { nativeEvent: { locationX: -50 } });
    await fireEvent(bar, 'responderRelease', { nativeEvent: { locationX: 999 } });
    expect(onSeek).toHaveBeenCalledWith(100);
  });

  it('aborts the scrub without seeking when the responder is taken away', async () => {
    const onSeek = jest.fn();
    const onScrub = jest.fn();
    await renderSeekbar({ onSeek, onScrub });

    const bar = screen.getByTestId('player-seek-bar');
    await fireEvent(bar, 'responderGrant', { nativeEvent: { locationX: 120 } });
    await fireEvent(bar, 'responderTerminate');

    expect(onScrub).toHaveBeenLastCalledWith(null);
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('stays inert before layout or without a duration', async () => {
    const onSeek = jest.fn();
    const onScrub = jest.fn();

    // Not laid out yet: touches resolve to 0 rather than garbage.
    await render(<SeekBar currentTime={30} duration={100} onSeek={onSeek} onScrub={onScrub} />);
    const bar = screen.getByTestId('player-seek-bar');
    await fireEvent(bar, 'responderGrant', { nativeEvent: { locationX: 120 } });
    expect(onScrub).toHaveBeenCalledWith(0);
    await fireEvent(bar, 'responderRelease', { nativeEvent: { locationX: 120 } });
    expect(onSeek).toHaveBeenCalledWith(0);

    // The responder is not wanted while there is no duration to seek in.
    await render(<SeekBar currentTime={30} duration={0} onSeek={onSeek} onScrub={onScrub} />);
    const empty = screen.getByTestId('player-seek-bar');
    await fireEvent.layout(empty, { width: 200, height: 28 });
    const probes = empty.props as ResponderProbes;
    expect(probes.onStartShouldSetResponder()).toBe(false);
    expect(probes.onMoveShouldSetResponder()).toBe(false);
    expect(widthOf('player-seek-progress')).toBe('0%'); // duration 0 → no fill
  });

  it('seeks ±15s from the current position via accessibility actions (clamped)', async () => {
    const onSeek = jest.fn();
    await renderSeekbar({ currentTime: 90, duration: 100, onSeek });

    const bar = screen.getByTestId('player-seek-bar');
    await fireEvent(bar, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onSeek).toHaveBeenLastCalledWith(100); // 90 + 15 clamped to the duration

    await fireEvent(bar, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onSeek).toHaveBeenLastCalledWith(75);

    await fireEvent(bar, 'accessibilityAction', { nativeEvent: { actionName: 'other' } });
    expect(onSeek).toHaveBeenLastCalledWith(75); // unknown actions decrement (else-branch)
  });
});
