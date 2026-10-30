import { fireEvent, render, screen } from '@testing-library/react-native';

import { VideoSearchBar } from '@/components/videos/VideoSearchBar';

describe('VideoSearchBar', () => {
  it('shows the current query in the field', async () => {
    await render(<VideoSearchBar value="homelab" onChangeText={jest.fn()} onClose={jest.fn()} />);

    expect(screen.getByTestId('video-search-input').props.value).toBe('homelab');
  });

  it('reports typing', async () => {
    const onChangeText = jest.fn();
    await render(<VideoSearchBar value="" onChangeText={onChangeText} onClose={jest.fn()} />);

    await fireEvent.changeText(screen.getByTestId('video-search-input'), 'home la');
    expect(onChangeText).toHaveBeenCalledWith('home la');
  });

  it('clears the query with the ✕ button, which only appears when there is text', async () => {
    const onChangeText = jest.fn();
    await render(<VideoSearchBar value="" onChangeText={onChangeText} onClose={jest.fn()} />);
    expect(screen.queryByTestId('video-search-clear')).toBeNull();

    await render(<VideoSearchBar value="homelab" onChangeText={onChangeText} onClose={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('video-search-clear'));

    expect(onChangeText).toHaveBeenCalledWith('');
  });

  it('cancels via the Cancel button', async () => {
    const onClose = jest.fn();
    await render(<VideoSearchBar value="homelab" onChangeText={jest.fn()} onClose={onClose} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Close search' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
