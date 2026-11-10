/**
 * Shared flows for the live stream E2E suites (live-tab / live-page): launching, opening the Live tab
 * and the live player page, failing playback, and reading the Live tab's pull-to-refresh control.
 */
import { LIVESTREAM_ID, techCreator } from '@test/fixtures';

import type { RecordedRequest } from './mock-floatplane-api';
import type { Runtime } from './runtime';

export const POLL_MS = 60_000;
export const LIVE_PATH = `/live/${techCreator.id}` as const;

type App = Awaited<ReturnType<Runtime['renderApp']>>;
type Queries = ReturnType<Runtime['inTab']>;
type Player = ReturnType<Runtime['mockVideoPlayerState']['lastPlayer']>;

/** The props of the live list's RefreshControl the tests drive. */
interface RefreshControlProps {
  refreshing: boolean;
  onRefresh: () => void;
}

export const liveTab = (rt: Runtime): Queries => rt.inTab('live');
export const liveChecks = (rt: Runtime): RecordedRequest[] => rt.api.deliveryRequests('live');
export const techCard = (rt: Runtime): ReturnType<Queries['getByTestId']> =>
  liveTab(rt).getByTestId(`live-stream-${techCreator.id}`);
export const player = (rt: Runtime): Player => rt.mockVideoPlayerState.lastPlayer();

/** The Live tab list's pull-to-refresh control props. */
export function refreshControl(rt: Runtime): RefreshControlProps {
  const control = rt.screen.getByTestId('live-list').props['refreshControl'] as {
    props: RefreshControlProps;
  };
  return control.props;
}

export async function launch(rt: Runtime): Promise<App> {
  rt.seedSession();
  const app = await rt.renderApp();
  await rt.until(() => {
    expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();
  });
  return app;
}

export async function openLiveTab(rt: Runtime): Promise<App> {
  const app = await launch(rt);
  await rt.selectTab('live');
  await rt.until(() => {
    expect(app.getPathname()).toBe('/live');
  });
  return app;
}

/** Live tab → tap the (live) Tech card → the live player page. */
export async function openLivePlayer(rt: Runtime): Promise<App> {
  rt.api.liveNow.add(LIVESTREAM_ID);
  const app = await openLiveTab(rt);
  await rt.until(() => {
    expect(liveTab(rt).getByTestId('live-status-live')).toBeTruthy();
  });
  await rt.fireEvent.press(techCard(rt));
  await rt.until(() => {
    expect(app.getPathname()).toBe(LIVE_PATH);
  });
  await rt.until(() => {
    expect(rt.screen.getByTestId('video-player')).toBeTruthy();
  });
  return app;
}

/** The native player reports a failure (optionally with its error message). */
export async function failPlayback(rt: Runtime, message?: string): Promise<void> {
  await rt.act(() => {
    player(rt).status = 'error';
    player(rt).emit('statusChange', {
      status: 'error',
      error: message === undefined || message === '' ? undefined : { message },
    });
  });
}
