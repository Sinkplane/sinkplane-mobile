/**
 * Helpers for driving the real app under test.
 */

import { act as reactAct } from 'react';
import type { Fiber } from 'react-reconciler';
import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';

import type { User } from '@/shared';
import { FIXED_NOW, fixtureUser } from '@test/fixtures';
import { items as secureStore } from '@test/mocks/expo-secure-store';

import { api } from './mock-floatplane-api';
import { mockWebViewState } from './native-mocks';

// Re-exported so tests use the exact instances renderRouter binds to.
export { act, fireEvent, screen, testRouter, userEvent, within } from 'expo-router/testing-library';
export { api };

// renderRouter resolves this against the working directory (the project root under the npm scripts).
const APP_DIR = './src/app';

type RenderRouterResult = Awaited<ReturnType<typeof renderRouter>>;

/**
 * Boot the real app (src/app routes, providers, screens) at `initialUrl`.
 * The clock is pinned to FIXED_NOW (renderRouter keeps fake timers on at the current time).
 */
export async function renderApp(initialUrl = '/'): Promise<RenderRouterResult> {
  jest.useFakeTimers({ now: FIXED_NOW });
  return renderRouter(APP_DIR, { initialUrl });
}

/**
 * Seed secure storage the way a previous sign-in left it — i.e. launch the app already signed in.
 * useStorageState JSON-encodes values and the session provider hands it a pre-stringified user,
 * so `fpuser` is double-encoded on disk.
 */
export function seedSession({ token = api.createSession(), user = fixtureUser }: { token?: string; user?: User } = {}): string {
  secureStore.set('fptoken', JSON.stringify(token));
  secureStore.set('fpuser', JSON.stringify(JSON.stringify(user)));
  return token;
}

/** Advance the (fake) clock and let React + queries settle. */
export async function advanceTime(ms: number): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

/**
 * Deterministic `waitFor` for fake timers: flush, assert, step the clock, repeat until the
 * assertion passes or the fake-time budget runs out.
 */
export async function until(assertion: () => void, { maxFakeMs = 5000, stepMs = 50 } = {}): Promise<void> {
  for (let waited = 0; ; waited += stepMs) {
    try {
      await advanceTime(0);
      assertion();
      return;
    } catch (error) {
      if (waited >= maxFakeMs) throw error;
      await advanceTime(stepMs);
    }
  }
}

/**
 * Tap something whose handler awaits the network, without waiting for that request — so the
 * test can assert the in-between UI. (RNTL's fireEvent only resolves once the handler's work
 * settles.) Follow up with until(), which advances the fake clock inside act().
 */
export function pressWithoutWaiting(element: { unstable_fiber: Fiber | null }): void {
  let fiber = element.unstable_fiber;
  while (fiber && typeof (fiber.memoizedProps as { onPress?: unknown } | null)?.onPress !== 'function') fiber = fiber.return;
  if (!fiber) throw new Error('No onPress handler found for element');
  const { onPress } = fiber.memoizedProps as { onPress: () => unknown };
  reactAct(() => {
    void onPress();
  });
}

// ---------------------------------------------------------------------------
// Native tabs — the real RNSTabsHost/RNSTabsScreen host components render under Jest.
// Non-focused tabs stay mounted (native tabs preload them), so scope queries with inTab().
// ---------------------------------------------------------------------------

export type TabName = 'index' | 'settings';

const tabHost = () => {
  const [host] = screen.container.queryAll(node => node.type === 'RNSTabsHostIOS');
  if (!host) throw new Error('Native tab host is not rendered');
  return host;
};

/** The tab the native tab bar currently shows. */
export const selectedTab = (): string | undefined => tabHost().props.navStateRequest?.selectedScreenKey;

/** Queries scoped to one tab's screen. */
export function inTab(name: TabName) {
  const [tabScreen] = screen.container.queryAll(node => node.type === 'RNSTabsScreenIOS' && node.props.screenKey === name);
  if (!tabScreen) throw new Error(`Tab "${name}" is not rendered`);
  return within(tabScreen);
}

/** Tap a native tab bar item (the selection event UITabBar / BottomNavigationView report). */
export async function selectTab(name: TabName): Promise<void> {
  const host = tabHost();
  await fireEvent(host, 'tabSelected', {
    nativeEvent: { selectedScreenKey: name, provenance: host.props.navStateRequest?.baseProvenance ?? 0, actionOrigin: 'user' },
  });
}

// ---------------------------------------------------------------------------
// Lists — FlatList virtualizes (only ~10 rows mount) and only fires onEndReached once its last
// row has been laid out, which never happens without a native layout pass. These read the list
// component's props from the rendered host ScrollView instead.
// ---------------------------------------------------------------------------

interface ListProps {
  data?: readonly { id: string }[];
  onEndReached?: (info: { distanceFromEnd: number }) => void;
}

function listProps(testID: string): ListProps {
  let fiber = screen.getByTestId(testID).unstable_fiber;
  while (fiber) {
    const props = fiber.memoizedProps as ListProps | null;
    if (props?.data && props.onEndReached) return props;
    fiber = fiber.return;
  }
  throw new Error(`No FlatList found for testID "${testID}"`);
}

/** Ids of every item the list holds (rendered or virtualized away). */
export const listItemIds = (testID: string): string[] => (listProps(testID).data ?? []).map(item => item.id);

/** The user scrolls to the bottom of the list. */
export async function reachListEnd(testID: string): Promise<void> {
  const { onEndReached } = listProps(testID);
  await act(async () => {
    onEndReached?.({ distanceFromEnd: 0 });
  });
}

// ---------------------------------------------------------------------------
// Turnstile driver — stands in for the Cloudflare challenge inside the WebView.
// ---------------------------------------------------------------------------

const webView = () => {
  if (!mockWebViewState.props) throw new Error('Turnstile WebView has not mounted');
  return mockWebViewState.props;
};

export const turnstile = {
  mounted: () => mockWebViewState.props !== null,
  /** How many times the challenge has been (re)mounted — the app remounts it after each failure. */
  mounts: () => mockWebViewState.mounts,
  html: () => webView().source?.html ?? '',

  async emit(message: unknown): Promise<void> {
    await act(async () => {
      webView().onMessage?.({ nativeEvent: { data: JSON.stringify(message) } });
    });
  },

  /** Widget loads and the user passes the challenge; returns the issued (valid) token. */
  async solve(): Promise<string> {
    const token = api.issueCaptchaToken();
    await this.emit({ type: 'load' });
    await this.emit({ type: 'token', token });
    return token;
  },

  async fail(error = 'turnstile: 110200'): Promise<void> {
    await this.emit({ type: 'error', error });
  },
};
