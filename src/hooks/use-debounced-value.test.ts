import { act, renderHook } from '@testing-library/react-native';

import { useDebouncedValue } from '@/hooks/use-debounced-value';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the initial value immediately', async () => {
    const { result } = await renderHook<string, { value: string }>(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });
    expect(result.current).toBe('a');
  });

  it('emits a new value only after the delay has passed', async () => {
    const { result, rerender } = await renderHook<string, { value: string }>(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });

    await rerender({ value: 'ab' });
    expect(result.current).toBe('a');

    await advance(299);
    expect(result.current).toBe('a');

    await advance(1);
    expect(result.current).toBe('ab');
  });

  it('restarts the timer on every change, so only the last value lands', async () => {
    const { result, rerender } = await renderHook<string, { value: string }>(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });

    await rerender({ value: 'ab' });
    await advance(200);
    await rerender({ value: 'abc' });
    await advance(200);
    expect(result.current).toBe('a');

    await advance(100);
    expect(result.current).toBe('abc');
  });

  it('does not emit after unmount', async () => {
    const { result, rerender, unmount } = await renderHook<string, { value: string }>(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });

    await rerender({ value: 'ab' });
    unmount();
    await advance(400);
    expect(result.current).toBe('a');
  });
});

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}
