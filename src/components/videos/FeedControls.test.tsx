import { fireEvent, render, screen } from '@testing-library/react-native';

import { FeedControls, type FeedControlsProps } from '@/components/videos/FeedControls';
import { AssDass } from '@/shared';
import { fixtureCreators, gamingCreator, techCreator, techSideChannel } from '@test/fixtures';

function props(overrides: Partial<FeedControlsProps> = {}): FeedControlsProps {
  return {
    creators: fixtureCreators,
    selectedCreator: undefined,
    selectedCreatorId: undefined,
    channelId: undefined,
    sort: AssDass.DESC,
    searchOpen: false,
    searchInput: '',
    onSelectCreator: jest.fn(),
    onChannelChange: jest.fn(),
    onSortChange: jest.fn(),
    onSearchToggle: jest.fn(),
    onSearchInputChange: jest.fn(),
    ...overrides,
  };
}

describe('FeedControls', () => {
  it('toggles the sort order', async () => {
    const newest = props();
    await render(<FeedControls {...newest} />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Sorted by newest first. Tap to change.' }),
    );
    expect(newest.onSortChange).toHaveBeenCalledWith(AssDass.ASC);

    const oldest = props({ sort: AssDass.ASC });
    await render(<FeedControls {...oldest} />);
    expect(screen.getByText('Oldest')).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Sorted by oldest first. Tap to change.' }),
    );
    expect(oldest.onSortChange).toHaveBeenCalledWith(AssDass.DESC);
  });

  it('opens the search field, which reports typing and closes again', async () => {
    const closed = props();
    await render(<FeedControls {...closed} />);
    expect(screen.queryByTestId('video-search-input')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Search videos' }));
    expect(closed.onSearchToggle).toHaveBeenCalledTimes(1);

    const open = props({ searchOpen: true, searchInput: 'lab' });
    await render(<FeedControls {...open} />);
    await fireEvent.changeText(screen.getByTestId('video-search-input'), 'labs');
    expect(open.onSearchInputChange).toHaveBeenCalledWith('labs');
    await fireEvent.press(screen.getByTestId('video-search-toggle'));
    expect(open.onSearchToggle).toHaveBeenCalledTimes(1);
  });

  it('shows channel chips for a creator with several channels', async () => {
    const tech = props({
      selectedCreator: techCreator,
      selectedCreatorId: techCreator.id,
      channelId: techSideChannel.id,
    });
    await render(<FeedControls {...tech} />);

    expect(screen.getByRole('button', { name: techSideChannel.title })).toBeSelected();
    await fireEvent.press(screen.getByRole('button', { name: 'All' }));
    expect(tech.onChannelChange).toHaveBeenCalledWith(undefined);
    await fireEvent.press(screen.getByRole('button', { name: techSideChannel.title }));
    expect(tech.onChannelChange).toHaveBeenCalledWith(techSideChannel.id);
  });

  it('has no channel chips for a single-channel creator or the merged feed', async () => {
    await render(
      <FeedControls
        {...props({ selectedCreator: gamingCreator, selectedCreatorId: gamingCreator.id })}
      />,
    );
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull();

    await render(<FeedControls {...props()} />);
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
  });
});
