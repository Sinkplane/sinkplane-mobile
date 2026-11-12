import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { SuggestedVideos } from '@/components/video-page/SuggestedVideos';
import { makeVideo, techCreator, techMainChannel } from '@test/fixtures';

const first = makeVideo(techCreator, techMainChannel, { id: 'next-1', title: 'Next One' });
const second = makeVideo(techCreator, techMainChannel, { id: 'next-2', title: 'Next Two' });

/** The rendered width of a suggestion card. */
function cardWidth(id: string): ViewStyle['width'] {
  const style = screen.getByTestId(id).props['style'] as StyleProp<ViewStyle>;
  return StyleSheet.flatten(style)?.width;
}

async function renderSuggestions() {
  const handlers = { onSelect: jest.fn(), onReplay: jest.fn(), onDismiss: jest.fn() };
  await render(<SuggestedVideos videos={[first, second]} {...handlers} />);
  return handlers;
}

describe('SuggestedVideos', () => {
  it('lists the suggestions with their titles and durations', async () => {
    await renderSuggestions();
    expect(screen.getByText('Up next')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next One' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next Two' })).toBeTruthy();
    expect(screen.getAllByText(/^\d+:\d{2}/u)).toHaveLength(2);
  });

  it('opens a suggestion, replays, or closes', async () => {
    const { onSelect, onReplay, onDismiss } = await renderSuggestions();

    await fireEvent.press(screen.getByTestId('suggested-video-next-2'));
    expect(onSelect).toHaveBeenCalledWith(second);

    await fireEvent.press(screen.getByRole('button', { name: 'Replay' }));
    expect(onReplay).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('button', { name: 'Hide suggestions' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('sizes the cards to the space between the control bars', async () => {
    await renderSuggestions();
    const area = screen.getByTestId('suggested-videos');

    // A large player: two title lines, a big thumbnail, capped.
    await fireEvent(area, 'layout', { nativeEvent: { layout: { width: 1600, height: 700 } } });
    expect(cardWidth('suggested-video-next-1')).toBe(Math.round((150 * 16) / 9));
    expect(screen.getByText('Next One')).toHaveProp('numberOfLines', 2);

    // An inline phone player: one title line, the thumbnail takes what's left (never below the minimum).
    await fireEvent(area, 'layout', { nativeEvent: { layout: { width: 390, height: 110 } } });
    expect(cardWidth('suggested-video-next-1')).toBe(Math.round(((110 - 34 - 20 - 4) * 16) / 9));
    expect(screen.getByText('Next One')).toHaveProp('numberOfLines', 1);

    await fireEvent(area, 'layout', { nativeEvent: { layout: { width: 390, height: 40 } } });
    expect(cardWidth('suggested-video-next-1')).toBe(Math.round((40 * 16) / 9));
  });

  it('leaves out the duration badge when a post has no video duration', async () => {
    const noDuration = { ...first, metadata: { ...first.metadata, videoDuration: 0 } };
    await render(
      <SuggestedVideos
        videos={[noDuration]}
        onSelect={jest.fn()}
        onReplay={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.queryByText(/^\d+:\d{2}/u)).toBeNull();
  });
});
