/**
 * E2E: the video page's fake fullscreen (button, rotation, back arrow, Android back) and
 * playback errors.
 */
import { makeVideoPost } from '@test/fixtures';
import type { Orientation } from '@test/mocks/expo-screen-orientation';

import { loadRuntime, type Runtime } from './helpers/runtime';
import {
  defined,
  firstTechVideo,
  openVideo,
  player,
  POST_ID,
  untilPlayable,
} from './helpers/video-page';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

describe('fullscreen', () => {
  it('hides the comments, locks landscape, and comes back', async () => {
    await openVideo(rt);
    await untilPlayable(rt);
    await rt.until(() => {
      expect(rt.screen.getByTestId(`comment-${POST_ID}-comment-1`)).toBeTruthy();
    });

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Enter fullscreen' }));
    await rt.until(() => {
      expect(rt.screen.queryByTestId('comment-list')).toBeNull();
    });
    expect(rt.screen.getByTestId('video-player')).toBeTruthy();
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(
      rt.orientation.OrientationLock.LANDSCAPE,
    );

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Exit fullscreen' }));
    await rt.until(() => {
      expect(rt.screen.getByTestId('comment-list')).toBeTruthy();
    });
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(
      rt.orientation.OrientationLock.PORTRAIT_UP,
    );
  });

  it('follows the device rotation once the video is playable', async () => {
    const rotate = (orientation: Orientation) =>
      rt.act(() => {
        rt.orientation.emitOrientationChange(orientation);
      });
    await openVideo(rt);
    await untilPlayable(rt);
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(
      rt.orientation.OrientationLock.DEFAULT,
    );

    await rotate(rt.orientation.Orientation.LANDSCAPE_LEFT);
    await rt.until(() => {
      expect(rt.screen.queryByTestId('comment-list')).toBeNull();
    });
    expect(rt.screen.getByRole('button', { name: 'Exit fullscreen' })).toBeTruthy();

    await rotate(rt.orientation.Orientation.PORTRAIT_UP);
    await rt.until(() => {
      expect(rt.screen.getByTestId('comment-list')).toBeTruthy();
    });
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(
      rt.orientation.OrientationLock.DEFAULT,
    );
  });

  it('the back arrow leaves rotation-driven fullscreen and keeps the page in portrait', async () => {
    await openVideo(rt);
    await untilPlayable(rt);
    await rt.act(() => {
      rt.orientation.emitOrientationChange(rt.orientation.Orientation.LANDSCAPE_LEFT);
    });
    await rt.until(() => {
      expect(rt.screen.queryByTestId('comment-list')).toBeNull();
    });

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Back' }));
    await rt.until(() => {
      expect(rt.screen.getByTestId('comment-list')).toBeTruthy();
    });
    expect(rt.screen.getByTestId('video-screen')).toBeTruthy();
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(
      rt.orientation.OrientationLock.PORTRAIT_UP,
    );
  });

  it('keeps an image post in portrait', async () => {
    const video = firstTechVideo(rt);
    rt.api.posts.set(POST_ID, makeVideoPost(video, { videoAttachments: false }));
    await openVideo(rt);
    await rt.until(() => {
      expect(rt.screen.getByTestId('post-image')).toBeTruthy();
    });

    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(
      rt.orientation.OrientationLock.PORTRAIT_UP,
    );
    expect(rt.orientation.orientationListenerCount()).toBe(0);
  });

  it('the Android back button leaves fullscreen instead of the page', async () => {
    await openVideo(rt);
    await untilPlayable(rt);

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Enter fullscreen' }));
    await rt.until(() => {
      expect(rt.screen.queryByTestId('comment-list')).toBeNull();
    });
    expect(rt.backHandlers.length).toBeGreaterThan(0);

    let handled: boolean | null | undefined;
    await rt.act(() => {
      handled = defined(rt.backHandlers.at(-1), 'a back handler')();
    });
    expect(handled).toBe(true);
    await rt.until(() => {
      expect(rt.screen.getByTestId('comment-list')).toBeTruthy();
    });
  });
});

describe('playback errors', () => {
  const failStream = (message: string) =>
    rt.act(() => {
      player(rt).status = 'error';
      player(rt).emit('statusChange', { status: 'error', error: { message } });
    });

  it('shows the error overlay and Retry reloads the stream and plays', async () => {
    await openVideo(rt);
    await untilPlayable(rt);

    await failStream('Network connection lost');
    await rt.until(() => {
      expect(rt.screen.getByTestId('player-error')).toBeTruthy();
    });
    expect(rt.screen.getByText('Network connection lost')).toBeTruthy();
    expect(rt.screen.queryByTestId('player-controls')).toBeNull();

    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Retry' }));
    expect(player(rt).replaceAsync).toHaveBeenCalledTimes(1);
    await rt.until(() => {
      expect(player(rt).play).toHaveBeenCalled();
    });
  });

  it('drops out of fullscreen (comments return) when the stream fails there', async () => {
    await openVideo(rt);
    await untilPlayable(rt);
    await rt.fireEvent.press(rt.screen.getByRole('button', { name: 'Enter fullscreen' }));
    await rt.until(() => {
      expect(rt.screen.queryByTestId('comment-list')).toBeNull();
    });

    await failStream('decoder failure');

    await rt.until(() => {
      expect(rt.screen.getByTestId('comment-list')).toBeTruthy();
    });
    expect(rt.screen.getByTestId('player-error')).toBeTruthy();
    expect(rt.orientation.lockAsync).toHaveBeenLastCalledWith(
      rt.orientation.OrientationLock.PORTRAIT_UP,
    );
  });
});
