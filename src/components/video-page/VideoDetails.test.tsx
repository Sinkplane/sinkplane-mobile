import { fireEvent, render, screen } from '@testing-library/react-native';

import { VideoDetails } from '@/components/video-page/VideoDetails';
import { FIXED_NOW, makeVideo, techCreator, techMainChannel } from '@test/fixtures';
import type { VideoPost } from '@/shared';
import type { usePostReaction } from '@/hooks/use-post-reaction';

const video = makeVideo(techCreator, techMainChannel, {
  id: 'post-1',
  title: 'Home Lab Tour 2026',
  likes: 42,
});
const post = { ...video, videoAttachments: [] } as unknown as VideoPost;

/** A reaction-hook result stand-in; only the fields VideoDetails reads. */
function reactionResult(state: Partial<ReturnType<typeof usePostReaction>> = {}) {
  return {
    reaction: null,
    likes: 42,
    dislikes: 3,
    isPending: false,
    error: null,
    toggle: jest.fn(),
    ...state,
  };
}

async function renderDetails(
  reaction: ReturnType<typeof usePostReaction> = reactionResult(),
  activePost: VideoPost = post,
) {
  await render(<VideoDetails post={activePost} reaction={reaction} />);
  return { reaction };
}

describe('VideoDetails', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: FIXED_NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the title, age, channel and comment count', async () => {
    await renderDetails();

    expect(screen.getByTestId('video-title')).toHaveTextContent('Home Lab Tour 2026');
    expect(screen.getByText('just now')).toBeTruthy();
    expect(screen.getByText('Main Channel')).toBeTruthy();
    expect(screen.getByText('Comments · 0')).toBeTruthy();
  });

  it('falls back to the creator when the post has no channel', async () => {
    await renderDetails(undefined, {
      ...post,
      channel: undefined,
      comments: 7,
    } as unknown as VideoPost);
    expect(screen.getByText(techCreator.title)).toBeTruthy();
    expect(screen.getByText('Comments · 7')).toBeTruthy();
  });

  it('shows an empty icon slot when neither channel nor creator has an icon', async () => {
    const bare = {
      ...post,
      channel: { title: 'Bare' },
      creator: { title: 'Bare' },
      comments: undefined,
    };
    await renderDetails(undefined, bare as unknown as VideoPost);
    expect(screen.getByText('Bare')).toBeTruthy();
    expect(screen.getByText('Comments · 0')).toBeTruthy();
  });

  it('renders relative ages from the pinned clock', async () => {
    await renderDetails(undefined, {
      ...post,
      releaseDate: new Date(FIXED_NOW.getTime() - 2 * 3600_000).toISOString(),
    });
    expect(screen.getByText('2 hours ago')).toBeTruthy();
  });

  it('forwards the reaction state and toggles to the reaction bar', async () => {
    const toggle = jest.fn();
    const { reaction } = await renderDetails(
      reactionResult({ reaction: 'like', likes: 43, toggle }),
    );

    expect(screen.getByTestId('reaction-like-count')).toHaveTextContent('43');
    expect(screen.getByRole('button', { name: 'Like, 43' })).toBeSelected();

    await fireEvent.press(screen.getByTestId('reaction-dislike'));
    expect(toggle).toHaveBeenCalledWith('dislike');
    expect(reaction.reaction).toBe('like');
  });

  it('disables the reaction bar while a toggle is pending', async () => {
    await renderDetails(reactionResult({ isPending: true }));
    expect(screen.getByRole('button', { name: 'Like, 42' })).toBeDisabled();
  });

  it('explains when the reaction could not be saved', async () => {
    await renderDetails(reactionResult({ error: new Error('nope') }));
    expect(screen.getByText("Couldn't save your reaction. Try again.")).toBeTruthy();
  });

  describe('description', () => {
    const withText = (text: string | null) => ({ ...post, text }) as unknown as VideoPost;

    it('shows a short description as plain text, without a toggle', async () => {
      await renderDetails(undefined, withText('<p>Pumpkins &amp; candy</p>'));
      expect(screen.getByTestId('post-description')).toHaveTextContent('Pumpkins & candy');
      expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
    });

    it('collapses a long description until Show more is pressed', async () => {
      await renderDetails(undefined, withText(`<p>${'Halloween stream. '.repeat(20)}</p>`));
      expect(screen.getByTestId('post-description')).toHaveProp('numberOfLines', 3);

      await fireEvent.press(screen.getByRole('button', { name: 'Show more' }));
      expect(screen.getByTestId('post-description')).not.toHaveProp('numberOfLines');

      await fireEvent.press(screen.getByRole('button', { name: 'Show less' }));
      expect(screen.getByTestId('post-description')).toHaveProp('numberOfLines', 3);
    });

    it('collapses a description with many short paragraphs', async () => {
      await renderDetails(undefined, withText('<p>a</p><p>b</p><p>c</p><p>d</p>'));
      expect(screen.getByRole('button', { name: 'Show more' })).toBeTruthy();
    });

    it('renders nothing for an empty body', async () => {
      await renderDetails(undefined, withText(null));
      expect(screen.queryByTestId('post-description')).toBeNull();
    });
  });
});
