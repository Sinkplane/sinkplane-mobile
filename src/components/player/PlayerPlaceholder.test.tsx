import { fireEvent, render, screen } from '@testing-library/react-native';

import { PlayerPlaceholder } from '@/components/player/PlayerPlaceholder';

describe('PlayerPlaceholder', () => {
  it('shows a spinner without a message', async () => {
    await render(<PlayerPlaceholder />);

    expect(screen.getByTestId('player-placeholder')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/./)).toBeNull();
  });

  it('shows the message and a Retry button', async () => {
    const onRetry = jest.fn();
    await render(<PlayerPlaceholder message="This video can't be played right now." onRetry={onRetry} />);

    expect(screen.getByText("This video can't be played right now.")).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('accepts a custom retry label', async () => {
    await render(<PlayerPlaceholder message="Not live." onRetry={jest.fn()} retryLabel="Check again" />);

    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
  });
});
