/**
 * E2E: the video page's resume fallback (batch progress endpoint), the end screen of suggested
 * videos, and a hardware keyboard's space bar.
 */
import { makeVideoPost } from '@test/fixtures';

import { loadRuntime, type Runtime } from './helpers/runtime';
import { firstTechVideo, openVideo, player, POST_ID, untilPlayable } from './helpers/video-page';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

async function startPlayback(): Promise<void> {
  await rt.act(() => {
    player(rt).setStatus('readyToPlay');
  });
}

async function playToEnd(): Promise<void> {
  await rt.act(() => {
    player(rt).emit('playToEnd');
  });
}

describe('resume position', () => {
  it('resumes from the batch progress endpoint when the post leaves out its progress', async () => {
    // Floatplane's post endpoint often has no `progress`; the TV app reads /api/v3/content/progress then.
    rt.api.posts.set(POST_ID, makeVideoPost(firstTechVideo(rt), { progress: null }));
    rt.api.progress.set(POST_ID, 125);
    await openVideo(rt);
    await untilPlayable(rt);

    const batch = rt.api
      .requestsTo('/api/v3/content/progress', 'GET')
      .find((req) => req.params.get('ids[0]') === POST_ID);
    expect(batch).toBeTruthy();
    await startPlayback();
    expect(player(rt).seeks).toContain(125);
    expect(player(rt).play).toHaveBeenCalled();
  });
});

describe('suggested videos', () => {
  it('shows them over the ended video and opens one in place of the finished video', async () => {
    await openVideo(rt);
    await untilPlayable(rt);
    await startPlayback();
    await playToEnd();

    await rt.until(() => {
      expect(rt.screen.getByTestId('suggested-videos')).toBeTruthy();
    });
    expect(rt.api.requestsTo('/api/v3/content/related')[0]?.params.get('id')).toBe(POST_ID);
    // The finished video itself isn't suggested.
    expect(rt.screen.queryByTestId(`suggested-video-${POST_ID}`)).toBeNull();

    await rt.fireEvent.press(rt.screen.getByTestId('suggested-video-ch-tech-main-02'));
    await rt.until(() => {
      expect(rt.screen.getByTestId('video-title')).toHaveTextContent('Main Channel Video 02');
    });
    expect(rt.screen.queryByTestId('suggested-videos')).toBeNull();
    // Replaced, not stacked: going back returns to the list, not to the finished video.
    expect(rt.screen.getAllByTestId('video-screen')).toHaveLength(1);
  });

  it('leaves the plain ended controls when Floatplane suggests nothing', async () => {
    rt.api.related.set(POST_ID, []);
    await openVideo(rt);
    await untilPlayable(rt);
    await startPlayback();
    await rt.until(() => {
      expect(rt.api.requestsTo('/api/v3/content/related')).toHaveLength(1);
    });
    await playToEnd();

    await rt.until(() => {
      expect(rt.screen.getByRole('button', { name: 'Replay' })).toBeTruthy();
    });
    expect(rt.screen.queryByTestId('suggested-videos')).toBeNull();
  });
});

describe('hardware keyboard', () => {
  it('toggles playback with the space bar', async () => {
    await openVideo(rt);
    await untilPlayable(rt);
    await startPlayback();
    await rt.until(() => {
      expect(rt.screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    });

    await rt.fireEvent(rt.screen.getByTestId('space-key-listener'), 'space');
    await rt.until(() => {
      expect(rt.screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    });
    expect(player(rt).pause).toHaveBeenCalled();

    await rt.fireEvent(rt.screen.getByTestId('space-key-listener'), 'space');
    await rt.until(() => {
      expect(rt.screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    });
  });
});
