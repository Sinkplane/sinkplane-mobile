/**
 * E2E: the demo world (jest/demo) that demo mode (store/demo, `SINKPLANE_DEMO=1 pnpm start`) runs
 * the app on for store screenshots: the demo account signs in without a captcha, and the feed,
 * history, livestream and video page show the made-up creators.
 */
import { FIXED_NOW } from '@test/fixtures';
import { DEMO_USER } from '@test/demo/catalog';
import { seedDemoWorld } from '@test/demo/world';

import { enterCredentials, openSignIn, signInButton } from './helpers/sign-in-flows';
import { loadRuntime, type Runtime } from './helpers/runtime';

const MEDIA = 'http://media.test';

let rt: Runtime;

/**
 * Demo mode hands requests outside floatplane.com to the network (store/demo/install.ts); here the
 * media server answers the live playlist check.
 */
const urlOf = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
};

function serveDemoMedia() {
  const apiFetch = globalThis.fetch;
  globalThis.fetch = (input, init) =>
    urlOf(input).startsWith(MEDIA)
      ? Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('#EXTM3U'),
        } as Response)
      : apiFetch(input, init);
}

beforeEach(() => {
  rt = loadRuntime();
  serveDemoMedia();
  seedDemoWorld(rt.api, { mediaBaseUrl: `${MEDIA}/`, now: FIXED_NOW });
});

async function launchSignedIn() {
  rt.seedSession({ user: rt.api.user });
  const app = await rt.renderApp();
  await rt.until(() => {
    expect(
      rt.inTab('index').getByText('I rebuilt a 1984 synthesizer with $40 of parts'),
    ).toBeTruthy();
  });
  return app;
}

describe('demo mode world', () => {
  it('signs in with the demo account, no captcha needed', async () => {
    await openSignIn(rt);
    await rt.until(() => {
      expect(rt.screen.getByLabelText('Captcha not required')).toBeTruthy();
    });
    await enterCredentials(rt, { username: DEMO_USER.username, password: DEMO_USER.password });
    await rt.fireEvent.press(signInButton(rt));

    await rt.until(() => {
      expect(
        rt.inTab('index').getByText('I rebuilt a 1984 synthesizer with $40 of parts'),
      ).toBeTruthy();
    });
  });

  it('serves every image from the demo media server', async () => {
    await launchSignedIn();

    const videos = [...rt.api.videos.values()].flatMap((byChannel) =>
      [...byChannel.values()].flat(),
    );
    const imagePaths = [
      rt.api.user.profileImage.path,
      ...rt.api.creators.map((creator) => creator.icon.path),
      ...rt.api.creators.map((creator) => creator.liveStream?.thumbnail.path),
      ...videos.map((video) => video.thumbnail.path),
    ].filter((path) => path !== undefined);
    expect(imagePaths.length).toBeGreaterThan(0);
    imagePaths.forEach((path) => {
      expect(path.startsWith(`${MEDIA}/`)).toBe(true);
    });
  });

  it('lists the watch history, newest watch first', async () => {
    await launchSignedIn();
    await rt.selectTab('history');

    await rt.until(() => {
      expect(rt.listItemIds('history-list').slice(0, 2)).toEqual(['synth-rebuild', 'field-track']);
    });
  });

  it('shows one creator live, the others offline, and badges the Live tab', async () => {
    await launchSignedIn();
    await rt.selectTab('live');

    await rt.until(() => {
      expect(rt.inTab('live').getByText('Late-night synth jam: taking requests')).toBeTruthy();
    });
    expect(rt.tabBadge('live')).toBe('LIVE');
    expect(rt.inTab('live').getAllByTestId('live-status-offline')).toHaveLength(3);
  });

  it('opens a video with its demo comments and a playable stream', async () => {
    const app = await launchSignedIn();
    await rt.act(() => {
      rt.router.push('/video/synth-rebuild');
    });

    await rt.until(() => {
      expect(app.getPathname()).toBe('/video/synth-rebuild');
      expect(
        rt.screen.getByText(
          'The moment the filter came back to life gave me chills. Great restoration.',
        ),
      ).toBeTruthy();
    });
    await rt.until(() => {
      expect(rt.mockVideoPlayerState.players.at(-1)?.source).toMatchObject({
        uri: `${MEDIA}/hls/video/index.m3u8`,
      });
    });
  });
});
