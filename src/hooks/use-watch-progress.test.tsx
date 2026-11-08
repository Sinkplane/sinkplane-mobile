import type { VideoPlayer } from 'expo-video';
import { act, renderHook } from '@testing-library/react-native';
import { createMockVideoPlayer, type MockVideoPlayer } from '@test/mocks/expo-video';

import { PROGRESS_SAVE_INTERVAL, useWatchProgress } from '@/hooks/use-watch-progress';

/** Render the hook against a fresh fake player (typed as the real one for the hook's signature). */
async function renderProgress(initialTime?: number) {
  const mock = createMockVideoPlayer();
  const save = jest.fn();
  const utils = await renderHook(({ time }: { time?: number }) => useWatchProgress(mock as unknown as VideoPlayer, time, save), {
    initialProps: { time: initialTime },
  });
  return { mock, save, ...utils };
}

const emitTime = (mock: MockVideoPlayer, currentTime: number) =>
  mock.emit('timeUpdate', { currentTime, bufferedPosition: currentTime, currentLiveTimestamp: null, currentOffsetFromLive: null });

describe('useWatchProgress', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('plays once the source is ready, without seeking when there is nothing to resume', async () => {
    const { mock } = await renderProgress();

    await act(async () => {
      mock.emit('statusChange', { status: 'readyToPlay' });
    });

    expect(mock.play).toHaveBeenCalledTimes(1);
    expect(mock.seeks).toEqual([]);

    // readyToPlay only resumes once.
    await act(async () => {
      mock.emit('statusChange', { status: 'readyToPlay' });
    });
    expect(mock.play).toHaveBeenCalledTimes(1);
  });

  it('also resumes when the player is already ready at mount', async () => {
    const mock = createMockVideoPlayer();
    mock.status = 'readyToPlay';
    const save = jest.fn();
    await renderHook(() => useWatchProgress(mock as unknown as VideoPlayer, undefined, save));

    expect(mock.play).toHaveBeenCalledTimes(1);
  });

  it('seeks to the saved position before playing', async () => {
    const { mock } = await renderProgress(42);

    await act(async () => {
      mock.emit('statusChange', { status: 'readyToPlay' });
    });

    expect(mock.seeks).toEqual([42]);
    expect(mock.play).toHaveBeenCalledTimes(1);
  });

  it('retries a resume seek the stream dropped, until the player lands on the target', async () => {
    const { mock } = await renderProgress(100);

    await act(async () => {
      mock.emit('statusChange', { status: 'readyToPlay' });
    });
    expect(mock.seeks).toEqual([100]);

    // The player still reports ~0: the seek was dropped, so it is re-issued…
    await act(async () => {
      emitTime(mock, 0);
    });
    expect(mock.seeks).toEqual([100, 100]);

    // …and not saved as position 0 either.
    // Landing one second short of the target (tolerance) settles the resume.
    await act(async () => {
      emitTime(mock, 99.5);
    });
    expect(mock.seeks).toEqual([100, 100]);

    // Now updates flow and save.
    await act(async () => {
      emitTime(mock, 100 + PROGRESS_SAVE_INTERVAL);
    });
  });

  it('saves while playing once the position moved 15s from the last save', async () => {
    const { mock, save } = await renderProgress();
    await act(async () => {
      mock.emit('statusChange', { status: 'readyToPlay' });
    });

    await act(async () => {
      emitTime(mock, 10);
      emitTime(mock, 14.9);
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      emitTime(mock, 15);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith(15);

    // Smaller moves don't trigger another save.
    await act(async () => {
      emitTime(mock, 20);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('ignores time updates while paused (they arrive before/after playback)', async () => {
    const { mock, save } = await renderProgress();
    await act(async () => {
      mock.emit('statusChange', { status: 'readyToPlay' });
      mock.pause();
    });

    await act(async () => {
      emitTime(mock, 30);
    });
    expect(save).not.toHaveBeenCalled();

    // …but tracks the position so the next pause-with-delta saves it.
    await act(async () => {
      mock.play();
      mock.pause();
    });
    expect(save).toHaveBeenCalledWith(30);
  });

  it('saves on pause when the position moved at least 2s', async () => {
    const { mock, save } = await renderProgress();
    await act(async () => {
      mock.emit('statusChange', { status: 'readyToPlay' });
    });

    await act(async () => {
      emitTime(mock, 5);
      mock.pause(); // pause event (playingChange false)
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(5);

    // Pausing again without moving does not re-save.
    await act(async () => {
      mock.play();
      mock.pause();
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('does not save a pause that arrived before playback started', async () => {
    const { mock, save } = await renderProgress();

    await act(async () => {
      mock.emit('playingChange', { isPlaying: false });
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('saves the last position on unmount when it moved at least 2s', async () => {
    const { mock, save, unmount } = await renderProgress();
    await act(async () => {
      mock.emit('statusChange', { status: 'readyToPlay' });
      emitTime(mock, 12);
    });
    await unmount();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(12);
  });

  it('skips the unmount save when barely anything was watched', async () => {
    const { mock, save, unmount } = await renderProgress();
    await act(async () => {
      mock.emit('statusChange', { status: 'readyToPlay' });
      emitTime(mock, 1.5);
    });
    await unmount();

    expect(save).not.toHaveBeenCalled();
  });

  it('uses the latest save callback (identity changes do not reset the saved baseline)', async () => {
    const mock = createMockVideoPlayer();
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = await renderHook(
      ({ save }: { save: (seconds: number) => void }) => useWatchProgress(mock as unknown as VideoPlayer, undefined, save),
      { initialProps: { save: first } },
    );

    await act(async () => {
      mock.emit('statusChange', { status: 'readyToPlay' });
      emitTime(mock, 20);
    });
    expect(first).toHaveBeenCalledTimes(1);

    await rerender({ save: second });
    await act(async () => {
      emitTime(mock, 40);
    });
    expect(second).toHaveBeenCalledWith(40);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('only autoplays without a save callback (live streams)', async () => {
    const mock = createMockVideoPlayer();
    const { unmount } = await renderHook(() => useWatchProgress(mock as unknown as VideoPlayer, undefined, undefined));

    await act(async () => mock.setStatus('readyToPlay'));
    expect(mock.play).toHaveBeenCalled();
    await act(async () => {
      emitTime(mock, 40);
      mock.pause();
    });
    await expect(unmount()).resolves.toBeUndefined();
  });

  it('a view taking over a started player neither seeks nor autoplays again, and saves relative to its position', async () => {
    const mock = createMockVideoPlayer();
    const save = jest.fn();
    // The video page started this player and saved some progress before the close arrow.
    const page = await renderHook(() => useWatchProgress(mock as unknown as VideoPlayer, undefined, save));
    await act(async () => {
      mock.emit('statusChange', { status: 'readyToPlay' });
      mock.currentTime = 200;
      emitTime(mock, 200);
    });
    expect(mock.play).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(200);
    await page.unmount();

    // The mini player takes the same player over (even with the post's saved progress handed to
    // it): no seek to 30, no autoplay, and saving continues relative to 200.
    await renderHook(() => useWatchProgress(mock as unknown as VideoPlayer, 30, save));
    expect(mock.play).toHaveBeenCalledTimes(1);
    expect(mock.seeks).toEqual([200]); // only the position the page reached

    await act(async () => emitTime(mock, 210));
    expect(save).toHaveBeenCalledTimes(1); // 10s past 200: below the 15s interval
    await act(async () => emitTime(mock, 200 + PROGRESS_SAVE_INTERVAL));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(200 + PROGRESS_SAVE_INTERVAL);
  });

  it('a view taking over a player that was still loading finishes the resume the page never got to', async () => {
    const mock = createMockVideoPlayer();
    const save = jest.fn();
    // Minimized before the stream ever became ready: the page's resume (seek + autoplay) never ran.
    const page = await renderHook(() => useWatchProgress(mock as unknown as VideoPlayer, 42, save));
    expect(mock.play).not.toHaveBeenCalled();
    expect(mock.seeks).toEqual([]);
    await page.unmount();

    // The tile takes over with the session's saved position and completes the resume once ready.
    await renderHook(() => useWatchProgress(mock as unknown as VideoPlayer, 42, save));
    await act(async () => {
      mock.setStatus('readyToPlay');
    });
    expect(mock.seeks).toEqual([42]);
    expect(mock.play).toHaveBeenCalledTimes(1);

    // Having started, the player is marked: a third view taking it over skips seek and autoplay.
    await renderHook(() => useWatchProgress(mock as unknown as VideoPlayer, 42, save));
    expect(mock.seeks).toEqual([42]);
    expect(mock.play).toHaveBeenCalledTimes(1);
  });
});
