import { fireEvent, render, screen } from '@testing-library/react-native';

import { VideoDetails } from '@/components/video-page/VideoDetails';
import { FIXED_NOW, makeVideo, techCreator, techMainChannel } from '@test/fixtures';
import type { VideoPost } from '@/shared';
import type { usePostReaction } from '@/hooks/use-post-reaction';

const video = makeVideo(techCreator, techMainChannel, { id: 'post-1', title: 'Home Lab Tour 2026', likes: 42 });
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
  } as ReturnType<typeof usePostReaction>;
}

async function renderDetails(reaction: ReturnType<typeof usePostReaction> = reactionResult(), activePost: VideoPost = post) {
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

  it('renders relative ages from the pinned clock', async () => {
    await renderDetails(undefined, {
      ...post,
      releaseDate: new Date(FIXED_NOW.getTime() - 2 * 3600_000).toISOString(),
    } as unknown as VideoPost);
    expect(screen.getByText('2 hours ago')).toBeTruthy();
  });

  it('forwards the reaction state and toggles to the reaction bar', async () => {
    const toggle = jest.fn();
    const { reaction } = await renderDetails(reactionResult({ reaction: 'like', likes: 43, toggle }));

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
});
