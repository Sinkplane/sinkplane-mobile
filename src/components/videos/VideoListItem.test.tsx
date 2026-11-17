import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  userEvent,
} from '@testing-library/react-native';

import { VideoListItem } from '@/components/videos/VideoListItem';
import { useStopDownloadsOnSignOut, useVideoDownload } from '@/hooks/use-video-download';
import { downloadTarget, OPTION_720 } from '@test/download-store';
import { FIXED_NOW, makeVideo, techCreator, techMainChannel } from '@test/fixtures';

const DAY_MS = 24 * 60 * 60 * 1000;

const video = makeVideo(techCreator, techMainChannel, {
  id: 'video-1',
  title: 'Building a Home Lab',
  releaseDate: new Date(FIXED_NOW.getTime() - 3 * DAY_MS).toISOString(),
  duration: 3725,
  likes: 1500,
});

const widthOf = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props['style'] as StyleProp<ViewStyle>)?.width;

describe('VideoListItem', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: FIXED_NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the title, duration badge, and channel · likes · age metadata', async () => {
    await render(<VideoListItem video={video} />);

    expect(screen.getByText('Building a Home Lab')).toBeTruthy();
    expect(screen.getByText('1:02:05')).toBeTruthy();
    expect(screen.getByText('Main Channel · 1.5K likes · 3 days ago')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Building a Home Lab' })).toBeTruthy();
  });

  it('shows watch progress as a percentage of the duration', async () => {
    await render(<VideoListItem video={video} progress={3725 / 4} />);
    expect(widthOf('video-progress-video-1')).toBe('25%');
  });

  it('caps the progress bar at 100%', async () => {
    await render(<VideoListItem video={video} progress={99_999} />);
    expect(widthOf('video-progress-video-1')).toBe('100%');
  });

  it("shows the video's download badge on the thumbnail only while it has one", async () => {
    const view = await render(<VideoListItem video={video} />);
    expect(view.queryByTestId('download-badge-video-1')).toBeNull();

    const { result } = await renderHook(() => useVideoDownload(downloadTarget('video-1'), 'token'));
    await act(() => {
      result.current.start(OPTION_720);
    });
    expect(view.getByTestId('download-badge-video-1')).toBeTruthy();
    await act(() => {
      result.current.cancel();
    });
    await renderHook(() => {
      useStopDownloadsOnSignOut(false);
    });
    expect(view.queryByTestId('download-badge-video-1')).toBeNull();
  });

  it('hides the progress bar when unwatched', async () => {
    await render(<VideoListItem video={video} progress={0} />);
    expect(screen.queryByTestId('video-progress-video-1')).toBeNull();
  });

  it('hides the duration badge and progress for posts without video', async () => {
    const textPost = makeVideo(techCreator, techMainChannel, {
      id: 'text-post',
      title: 'Text only',
      duration: 0,
      hasVideo: false,
    });
    await render(<VideoListItem video={textPost} progress={30} />);

    expect(screen.queryByText('0:00')).toBeNull();
    expect(screen.queryByTestId('video-progress-text-post')).toBeNull();
  });

  it('omits missing metadata parts instead of rendering empty separators', async () => {
    const bare = {
      ...makeVideo(techCreator, techMainChannel, {
        id: 'bare',
        title: 'Bare',
        likes: 2,
        releaseDate: null,
      }),
    };
    // Some API payloads omit the embedded channel entirely.
    const withoutChannel = { ...bare, channel: undefined } as unknown as typeof bare;
    await render(<VideoListItem video={withoutChannel} />);

    expect(screen.getByText('2 likes')).toBeTruthy();
  });

  it('calls onPress with the video when tapped', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(<VideoListItem video={video} onPress={onPress} />);

    // userEvent runs the full pressIn → pressOut cycle, so the pressed style is exercised too.
    await user.press(screen.getByTestId('video-list-item-video-1'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(video);
  });

  it('is inert without an onPress handler', async () => {
    await render(<VideoListItem video={video} />);
    await expect(
      fireEvent.press(screen.getByTestId('video-list-item-video-1')),
    ).resolves.toBeUndefined();
  });

  it('a long press hands the video to onLongPress (not onPress)', async () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    await render(<VideoListItem video={video} onPress={onPress} onLongPress={onLongPress} />);
    await fireEvent(screen.getByTestId('video-list-item-video-1'), 'longPress');
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledWith(video);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('offers the long press as a "Download options" accessibility action', async () => {
    const onLongPress = jest.fn();
    await render(<VideoListItem video={video} onLongPress={onLongPress} />);
    const item = screen.getByTestId('video-list-item-video-1');
    expect(item.props['accessibilityActions']).toEqual([
      { name: 'longpress', label: 'Download options' },
    ]);

    await fireEvent(item, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(onLongPress).not.toHaveBeenCalled();
    await fireEvent(item, 'accessibilityAction', { nativeEvent: { actionName: 'longpress' } });
    expect(onLongPress).toHaveBeenCalledWith(video);
  });

  it('has no long press or accessibility action without onLongPress', async () => {
    await render(<VideoListItem video={video} />);
    const item = screen.getByTestId('video-list-item-video-1');
    expect(item.props['accessibilityActions']).toBeUndefined();
    expect(item.props['onLongPress']).toBeUndefined();
  });
});
