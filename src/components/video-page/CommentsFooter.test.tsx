import { fireEvent, render, screen } from '@testing-library/react-native';

import { CommentsFooter, type CommentsFooterState } from '@/components/video-page/CommentsFooter';
import { makeComments } from '@test/fixtures';

function state(overrides: Partial<CommentsFooterState> = {}): CommentsFooterState {
  return {
    isLoading: false,
    isFetchingNextPage: false,
    isError: false,
    data: { pages: [[]] },
    refetch: jest.fn(),
    ...overrides,
  };
}

describe('CommentsFooter', () => {
  it('shows a spinner while loading or fetching the next page', async () => {
    for (const loading of [{ isLoading: true }, { isFetchingNextPage: true }]) {
      await render(<CommentsFooter comments={state(loading)} />);
      expect(JSON.stringify(screen.toJSON())).toContain('"type":"ActivityIndicator"');
      expect(screen.queryByText('No comments yet.')).toBeNull();
    }
  });

  it('offers a retry after an error', async () => {
    const comments = state({ isError: true });
    await render(<CommentsFooter comments={comments} />);

    await fireEvent.press(screen.getByTestId('comments-retry'));

    expect(comments.refetch).toHaveBeenCalledTimes(1);
  });

  it('says there are no comments when the first page is empty or missing', async () => {
    await render(<CommentsFooter comments={state()} />);
    expect(screen.getByText('No comments yet.')).toBeTruthy();

    await render(<CommentsFooter comments={state({ data: undefined })} />);
    expect(screen.getByText('No comments yet.')).toBeTruthy();
  });

  it('renders nothing below loaded comments', async () => {
    await render(<CommentsFooter comments={state({ data: { pages: [makeComments('p', 2)] } })} />);

    expect(screen.queryByText('No comments yet.')).toBeNull();
    expect(screen.queryByTestId('comments-retry')).toBeNull();
  });
});
