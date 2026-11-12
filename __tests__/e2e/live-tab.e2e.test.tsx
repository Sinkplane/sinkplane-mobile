/**
 * E2E: live streams (TV app parity), the Live tab — per-creator stream status, the tab bar badge
 * kept current by polling, pull-to-refresh, and status-check failures.
 */
import { gamingCreator, LIVESTREAM_ID, techCreator } from '@test/fixtures';
import type { Creator } from '@/shared';

import {
  launch,
  liveChecks,
  liveTab,
  openLiveTab,
  POLL_MS,
  refreshControl,
  techCard,
} from './helpers/live-flows';
import { loadRuntime, type Runtime } from './helpers/runtime';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

describe('the Live tab', () => {
  it('shows each streaming creator’s offline card, and no badge, while nobody is live', async () => {
    await openLiveTab(rt);

    await rt.until(() => {
      expect(liveTab(rt).getByTestId('live-status-offline')).toBeTruthy();
    });
    expect(liveTab(rt).getByText('Live')).toBeTruthy();
    expect(liveTab(rt).getByText('We are offline')).toBeTruthy();
    expect(liveTab(rt).getByText('Back Friday at 4pm')).toBeTruthy();
    // Gaming Channel has no livestream, so it isn't listed.
    expect(rt.listItemIds('live-list')).toEqual([techCreator.id]);
    expect(liveTab(rt).queryByText(gamingCreator.title)).toBeNull();
    expect(rt.tabBadge('live')).toBeUndefined();

    // Offline streams can't be opened.
    await rt.fireEvent.press(techCard(rt));
    expect(rt.screen.queryByTestId('live-screen')).toBeNull();
  });

  it('stays offline, with no badge, when the API hands out a playlist that 404s', async () => {
    // The real delivery endpoint can answer for an offline stream; only its playlist reveals it.
    rt.api.liveDeliveryWhenOffline = true;
    await openLiveTab(rt);

    await rt.until(() => {
      expect(liveTab(rt).getByTestId('live-status-offline')).toBeTruthy();
    });
    expect(rt.tabBadge('live')).toBeUndefined();
    expect(rt.api.requestsTo(`/${LIVESTREAM_ID}/live-abr.m3u8`).length).toBeGreaterThan(0);

    // Once the creator broadcasts the playlist is served, and the next check badges the tab.
    rt.api.liveNow.add(LIVESTREAM_ID);
    await rt.advanceTime(POLL_MS);
    await rt.until(() => {
      expect(rt.tabBadge('live')).toBe('LIVE');
    });
  });

  it('checks the livestream with the live delivery scenario and the session token', async () => {
    const token = rt.seedSession();
    await rt.renderApp();

    await rt.until(() => {
      expect(liveChecks(rt).length).toBeGreaterThan(0);
    });
    const [check] = liveChecks(rt);
    expect(check?.params.get('entityId')).toBe(LIVESTREAM_ID);
    expect(check?.params.get('entityKind')).toBe('livestream');
    expect(check?.bearer).toBe(token);
    // Only creators with a livestream are checked.
    expect(new Set(liveChecks(rt).map((request) => request.params.get('entityId')))).toEqual(
      new Set([LIVESTREAM_ID]),
    );
  });

  it('badges the tab and lists the stream as live when a creator is broadcasting', async () => {
    rt.api.liveNow.add(LIVESTREAM_ID);
    await openLiveTab(rt);

    await rt.until(() => {
      expect(liveTab(rt).getByTestId('live-status-live')).toBeTruthy();
    });
    expect(rt.tabBadge('live')).toBe('LIVE');
    expect(liveTab(rt).getByText('Tech Live: Friday Show')).toBeTruthy();
    expect(
      liveTab(rt).getByRole('button', { name: 'Watch Tech Channel live: Tech Live: Friday Show' }),
    ).toBeTruthy();
  });

  it('polls every minute, so the badge appears when a stream starts and clears when it ends', async () => {
    await launch(rt);
    await rt.until(() => {
      expect(liveChecks(rt).length).toBeGreaterThan(0);
    });
    expect(rt.tabBadge('live')).toBeUndefined();

    rt.api.liveNow.add(LIVESTREAM_ID);
    const checksBefore = liveChecks(rt).length;
    await rt.advanceTime(POLL_MS);
    await rt.until(() => {
      expect(rt.tabBadge('live')).toBe('LIVE');
    });
    expect(liveChecks(rt).length).toBeGreaterThan(checksBefore);

    rt.api.liveNow.delete(LIVESTREAM_ID);
    await rt.advanceTime(POLL_MS);
    await rt.until(() => {
      expect(rt.tabBadge('live')).toBeUndefined();
    });
  });

  it('re-checks the status when the tab is shown again', async () => {
    await openLiveTab(rt);
    await rt.until(() => {
      expect(liveTab(rt).getByTestId('live-status-offline')).toBeTruthy();
    });

    await rt.selectTab('index');
    rt.api.liveNow.add(LIVESTREAM_ID);
    await rt.selectTab('live');

    await rt.until(() => {
      expect(liveTab(rt).getByTestId('live-status-live')).toBeTruthy();
    });
  });

  it('re-checks the status on pull-to-refresh', async () => {
    await openLiveTab(rt);
    await rt.until(() => {
      expect(liveTab(rt).getByTestId('live-status-offline')).toBeTruthy();
    });

    // Background polls don't show the pull-to-refresh spinner.
    const checksBefore = liveChecks(rt).length;
    rt.api.latencyMs = 10_000;
    await rt.advanceTime(POLL_MS);
    expect(liveChecks(rt).length).toBeGreaterThan(checksBefore);
    expect(refreshControl(rt).refreshing).toBe(false);
    await rt.advanceTime(10_000);

    rt.api.liveNow.add(LIVESTREAM_ID);
    rt.api.latencyMs = 500;
    await rt.act(() => {
      refreshControl(rt).onRefresh();
    });
    expect(refreshControl(rt).refreshing).toBe(true);

    await rt.until(() => {
      expect(liveTab(rt).getByTestId('live-status-live')).toBeTruthy();
    });
    expect(refreshControl(rt).refreshing).toBe(false);
  });

  it('says when the status check fails', async () => {
    // The launch check and react-query's two retries.
    rt.api.failRequests('GET /api/v3/delivery/info', { status: 503, body: 'down' }, { count: 3 });
    await openLiveTab(rt);

    await rt.until(
      () => {
        expect(liveTab(rt).getByTestId('live-status-error')).toBeTruthy();
      },
      {
        maxFakeMs: 15_000,
      },
    );
    expect(liveTab(rt).getByText("Couldn't check the stream status. Pull to retry.")).toBeTruthy();
  });

  it('says so when no subscribed creator has a livestream', async () => {
    const withoutLive: Creator = { ...techCreator };
    delete withoutLive.liveStream;
    rt.api.creators = [withoutLive, gamingCreator];
    await openLiveTab(rt);

    await rt.until(() => {
      expect(liveTab(rt).getByText('No live streams')).toBeTruthy();
    });
    expect(liveTab(rt).getByText('None of your creators stream live on Floatplane.')).toBeTruthy();
    expect(liveChecks(rt)).toHaveLength(0);
  });
});
