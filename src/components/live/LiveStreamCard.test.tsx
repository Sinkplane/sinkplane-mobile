import { fireEvent, render, screen } from '@testing-library/react-native';

import { LiveStreamCard } from '@/components/live/LiveStreamCard';
import { gamingCreator, makeCreatorLiveStream, techCreator } from '@test/fixtures';

describe('LiveStreamCard', () => {
  it('opens a live stream when pressed', async () => {
    const stream = makeCreatorLiveStream('live');
    const onPress = jest.fn();
    await render(<LiveStreamCard stream={stream} onPress={onPress} />);

    expect(screen.getByTestId('live-status-live')).toBeTruthy();
    expect(screen.getByText('Tech Live: Friday Show')).toBeTruthy();
    expect(screen.getByText('Tech Channel')).toBeTruthy();
    // The live description stays on the player page.
    expect(screen.queryByText('Live tech talk & news')).toBeNull();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Watch Tech Channel live: Tech Live: Friday Show' }),
    );
    expect(onPress).toHaveBeenCalledWith(stream);
  });

  it('shows the offline card, which cannot be opened', async () => {
    const onPress = jest.fn();
    await render(<LiveStreamCard stream={makeCreatorLiveStream('offline')} onPress={onPress} />);

    expect(screen.getByTestId('live-status-offline')).toBeTruthy();
    expect(screen.getByText('We are offline')).toBeTruthy();
    expect(screen.getByText('Back Friday at 4pm')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();

    await fireEvent.press(screen.getByTestId(`live-stream-${techCreator.id}`));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('says when the status could not be checked', async () => {
    await render(<LiveStreamCard stream={makeCreatorLiveStream('error')} />);

    expect(screen.getByTestId('live-status-error')).toBeTruthy();
    expect(screen.getByText("Couldn't check the stream status. Pull to retry.")).toBeTruthy();
    expect(screen.queryByText('Back Friday at 4pm')).toBeNull();
  });

  it('renders without a creator icon or offline description', async () => {
    const liveStream = { ...makeCreatorLiveStream('offline').liveStream, offline: undefined };
    const creator = { ...gamingCreator, icon: undefined } as unknown as typeof gamingCreator;
    await render(
      <LiveStreamCard
        stream={makeCreatorLiveStream('offline', { creator, liveStream } as never)}
      />,
    );

    expect(screen.getByText('Gaming Channel is not live right now.')).toBeTruthy();
  });

  it('ignores presses while live without a handler', async () => {
    await render(<LiveStreamCard stream={makeCreatorLiveStream('live')} />);

    await expect(
      fireEvent.press(screen.getByTestId(`live-stream-${techCreator.id}`)),
    ).resolves.toBeUndefined();
  });
});
