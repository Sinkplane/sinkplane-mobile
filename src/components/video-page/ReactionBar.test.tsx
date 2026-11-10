import { fireEvent, render, screen } from '@testing-library/react-native';

import { ReactionBar } from '@/components/video-page/ReactionBar';

async function renderBar(props: Partial<Parameters<typeof ReactionBar>[0]> = {}) {
  const onToggle = jest.fn();
  await render(
    <ReactionBar reaction={null} likes={10} dislikes={2} onToggle={onToggle} {...props} />,
  );
  return { onToggle };
}

describe('ReactionBar', () => {
  it('renders formatted like and dislike counts', async () => {
    await renderBar({ likes: 1500, dislikes: 2_400_000 });
    expect(screen.getByTestId('reaction-like-count')).toHaveTextContent('1.5K');
    expect(screen.getByTestId('reaction-dislike-count')).toHaveTextContent('2.4M');
  });

  it('marks the active reaction selected and reports it to accessibility', async () => {
    await renderBar({ reaction: 'like' });
    expect(screen.getByRole('button', { name: 'Like, 10' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Dislike, 2' })).not.toBeSelected();
  });

  it('toggles like and dislike on tap', async () => {
    const { onToggle } = await renderBar();

    await fireEvent.press(screen.getByTestId('reaction-like'));
    await fireEvent.press(screen.getByTestId('reaction-dislike'));

    expect(onToggle).toHaveBeenNthCalledWith(1, 'like');
    expect(onToggle).toHaveBeenNthCalledWith(2, 'dislike');
  });

  it('does not fire while disabled', async () => {
    const { onToggle } = await renderBar({ disabled: true });

    await fireEvent.press(screen.getByTestId('reaction-like'));

    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Like, 10' })).toBeDisabled();
  });
});
