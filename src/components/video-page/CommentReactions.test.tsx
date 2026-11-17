import { fireEvent, render, screen } from '@testing-library/react-native';

import { CommentReactions } from '@/components/video-page/CommentReactions';
import type { PostReaction } from '@/hooks/use-post-reaction';
import { Colors } from '@/shared';

async function renderReactions(overrides: Partial<PostReaction> = {}, disabled = false) {
  const reaction: PostReaction = {
    reaction: null,
    likes: 1200,
    dislikes: 3,
    isPending: false,
    error: null,
    toggle: jest.fn(),
    ...overrides,
  };
  await render(<CommentReactions commentId="c1" reaction={reaction} disabled={disabled} />);
  return reaction;
}

describe('CommentReactions', () => {
  it('renders formatted like and dislike counts', async () => {
    await renderReactions();
    expect(screen.getByTestId('comment-c1-like-count')).toHaveTextContent('1.2K');
    expect(screen.getByTestId('comment-c1-dislike-count')).toHaveTextContent('3');
  });

  it('marks the active reaction selected and tints it', async () => {
    await renderReactions({ reaction: 'like' });
    expect(screen.getByRole('button', { name: 'Like comment, 1200' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Dislike comment, 3' })).not.toBeSelected();
    expect(screen.getByTestId('comment-c1-like-count')).toHaveStyle({ color: Colors.light.tint });
    expect(screen.getByTestId('comment-c1-dislike-count')).toHaveStyle({
      color: Colors.light.icon,
    });
  });

  it('toggles like and dislike on tap', async () => {
    const { toggle } = await renderReactions();

    await fireEvent.press(screen.getByTestId('comment-c1-like'));
    await fireEvent.press(screen.getByTestId('comment-c1-dislike'));

    expect(toggle).toHaveBeenNthCalledWith(1, 'like');
    expect(toggle).toHaveBeenNthCalledWith(2, 'dislike');
  });

  it('is disabled while a toggle is saving', async () => {
    const { toggle } = await renderReactions({ isPending: true });

    await fireEvent.press(screen.getByTestId('comment-c1-like'));

    expect(toggle).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Like comment, 1200' })).toBeDisabled();
  });

  it('is disabled and dimmed when told so (offline), without a toggle pending', async () => {
    const { toggle } = await renderReactions({}, true);

    await fireEvent.press(screen.getByTestId('comment-c1-like'));
    await fireEvent.press(screen.getByTestId('comment-c1-dislike'));

    expect(toggle).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Like comment, 1200' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dislike comment, 3' })).toBeDisabled();
    expect(screen.getByTestId('comment-c1-like')).toHaveStyle({ opacity: 0.6 });
  });

  it('is enabled and not dimmed by default', async () => {
    await renderReactions();
    expect(screen.getByTestId('comment-c1-like')).toBeEnabled();
    expect(screen.getByTestId('comment-c1-like')).not.toHaveStyle({ opacity: 0.6 });
  });
});
