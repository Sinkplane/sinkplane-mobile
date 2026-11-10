/**
 * Helpers for driving the real app under test.
 */

import { act as reactAct } from 'react';
import { type StyleProp, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';

import type { User } from '@/shared';
import { FIXED_NOW, fixtureUser } from '@test/fixtures';
import { items as secureStore } from '@test/mocks/expo-secure-store';

import { api } from './mock-floatplane-api';
import { type MockWebViewProps, mockWebViewState } from './native-mocks';

// Re-exported so tests use the exact instances renderRouter binds to.
export { act, fireEvent, screen, testRouter, within } from 'expo-router/testing-library';
// expo-router only re-exports userEvent's type; the runtime value is RNTL's (same module registry).
export { userEvent } from '@testing-library/react-native';
// The imperative router of this test's module registry (navigate like a deep link / notification would).
export { router } from 'expo-router';
export { api };

interface PressableProps {
  onPress?: () => unknown;
}

// renderRouter resolves this against the working directory (the project root under the make targets).
const APP_DIR = './src/app';

type RenderRouterResult = Awaited<ReturnType<typeof renderRouter>>;
/** A rendered element (RNTL's `TestInstance`). */
export type TestInstance = ReturnType<typeof screen.getByTestId>;

/**
 * Boot the real app (src/app routes, providers, screens) at `initialUrl`.
 * The clock is pinned to FIXED_NOW (renderRouter keeps fake timers on at the current time).
 */
export async function renderApp(initialUrl = '/'): Promise<RenderRouterResult> {
  jest.useFakeTimers({ now: FIXED_NOW });
  return renderRouter(APP_DIR, { initialUrl });
}

/** `value`, or a thrown error naming `what` when it is missing (instead of a `!` assertion). */
export function defined<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${what} to be defined`);
  }
  return value;
}

/** The flattened `style` prop of a rendered element (`{}` when it has none). */
export function styleOf(element: TestInstance): ViewStyle & TextStyle {
  return StyleSheet.flatten(element.props['style'] as StyleProp<ViewStyle & TextStyle>) ?? {};
}

/**
 * Seed secure storage the way a previous sign-in left it — i.e. launch the app already signed in.
 * useStorageState JSON-encodes values and the session provider hands it a pre-stringified user,
 * so `fpuser` is double-encoded on disk.
 */
export function seedSession({
  token = api.createSession(),
  user = fixtureUser,
}: { token?: string; user?: User } = {}): string {
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
export async function until(
  assertion: () => void,
  { maxFakeMs = 5000, stepMs = 50 } = {},
): Promise<void> {
  for (let waited = 0; ; waited += stepMs) {
    if (await passesAfterFlush(assertion, waited >= maxFakeMs)) {
      return;
    }
    await advanceTime(stepMs);
  }
}

/** Flush pending work, then run `assertion`: true when it passes; rethrows on the last attempt. */
async function passesAfterFlush(assertion: () => void, lastAttempt: boolean): Promise<boolean> {
  await advanceTime(0);
  try {
    assertion();
    return true;
  } catch (error) {
    if (lastAttempt) {
      throw error;
    }
    return false;
  }
}

/**
 * Tap something whose handler awaits the network, without waiting for that request — so the
 * test can assert the in-between UI. (RNTL's fireEvent only resolves once the handler's work
 * settles.) Follow up with until(), which advances the fake clock inside act().
 */
export function pressWithoutWaiting(element: TestInstance): void {
  const onPress = nearestOnPress(element);
  reactAct(() => {
    void onPress();
  });
}

/** The `onPress` of the element or its closest ancestor that has one. */
function nearestOnPress(element: TestInstance): () => unknown {
  for (let fiber = element.unstable_fiber; fiber; fiber = fiber.return) {
    const props = fiber.memoizedProps as PressableProps | null;
    if (typeof props?.onPress === 'function') {
      return props.onPress;
    }
  }
  throw new Error('No onPress handler found for element');
}

// ---------------------------------------------------------------------------
// Native tabs — the real RNSTabsHost/RNSTabsScreen host components render under Jest.
// Non-focused tabs stay mounted (native tabs preload them), so scope queries with inTab().
// ---------------------------------------------------------------------------

export type TabName = 'index' | 'history' | 'live' | 'settings';

/** The props of the native tab host / tab screens this file reads. */
interface TabHostProps {
  navStateRequest?: { selectedScreenKey?: string; baseProvenance?: number };
}
interface TabScreenProps {
  screenKey?: string;
  badgeValue?: string;
}

const tabHost = (): { instance: TestInstance; props: TabHostProps } => {
  const [host] = screen.container.queryAll((node) => node.type === 'RNSTabsHostIOS');
  if (!host) {
    throw new Error('Native tab host is not rendered');
  }
  return { instance: host, props: host.props as TabHostProps };
};

/** The tab the native tab bar currently shows. */
export const selectedTab = (): string | undefined =>
  tabHost().props.navStateRequest?.selectedScreenKey;

const isTabScreen = (node: TestInstance, name: TabName): boolean =>
  node.type === 'RNSTabsScreenIOS' && (node.props as TabScreenProps).screenKey === name;

const tabScreen = (name: TabName): TestInstance => {
  const [found] = screen.container.queryAll((node) => isTabScreen(node, name));
  if (!found) {
    throw new Error(`Tab "${name}" is not rendered`);
  }
  return found;
};

/** Queries scoped to one tab's screen. */
export function inTab(name: TabName): ReturnType<typeof within> {
  return within(tabScreen(name));
}

/** The badge text on a tab bar item (undefined when it shows no badge). */
export const tabBadge = (name: TabName): string | undefined =>
  (tabScreen(name).props as TabScreenProps).badgeValue;

/** Tap a native tab bar item (the selection event UITabBar / BottomNavigationView report). */
export async function selectTab(name: TabName): Promise<void> {
  const host = tabHost();
  await fireEvent(host.instance, 'tabSelected', {
    nativeEvent: {
      selectedScreenKey: name,
      provenance: host.props.navStateRequest?.baseProvenance ?? 0,
      actionOrigin: 'user',
    },
  });
}

// ---------------------------------------------------------------------------
// Lists — FlatList virtualizes (only ~10 rows mount) and only fires onEndReached once its last
// row has been laid out, which never happens without a native layout pass. These read the list
// component's props from the rendered host ScrollView instead.
// ---------------------------------------------------------------------------

interface ListProps {
  data?: readonly { id: string }[];
  renderItem?: unknown;
  onEndReached?: (info: { distanceFromEnd: number }) => void;
  numColumns?: number;
}

/** The props of a FlatList / VirtualizedList element (both take `data` + `renderItem`). */
const asListProps = (props: unknown): ListProps | null => {
  const candidate = props as ListProps | null;
  return Array.isArray(candidate?.data) && 'renderItem' in candidate ? candidate : null;
};

function listProps(testID: string): ListProps {
  let fiber = screen.getByTestId(testID).unstable_fiber;
  let belowFlatList: ListProps | null = null;
  while (fiber) {
    const props = asListProps(fiber.memoizedProps);
    // The FlatList element itself. (The VirtualizedList below it gets the same `data` but not
    // `numColumns` — FlatList destructures that prop out — so keep walking past it.)
    if (props && 'numColumns' in props) {
      return props;
    }
    belowFlatList ??= props;
    fiber = fiber.return;
  }
  // A FlatList that never passes numColumns: fall back to the VirtualizedList's props.
  if (belowFlatList) {
    return belowFlatList;
  }
  throw new Error(`No FlatList found for testID "${testID}"`);
}

/** How many columns a tab list lays out (phones: 1; tablet grids: more — see useListGrid). */
export const listNumColumns = (testID: string): number => listProps(testID).numColumns ?? 1;

/** Ids of every item the list holds (rendered or virtualized away). */
export const listItemIds = (testID: string): string[] =>
  (listProps(testID).data ?? []).map((item) => item.id);

/** The user scrolls to the bottom of the list. */
export async function reachListEnd(testID: string): Promise<void> {
  const { onEndReached } = listProps(testID);
  await act(() => {
    onEndReached?.({ distanceFromEnd: 0 });
  });
}

// ---------------------------------------------------------------------------
// Turnstile driver — stands in for the Cloudflare challenge inside the WebView.
// ---------------------------------------------------------------------------

const webView = (): MockWebViewProps => {
  if (!mockWebViewState.props) throw new Error('Turnstile WebView has not mounted');
  return mockWebViewState.props;
};

export const turnstile = {
  mounted: (): boolean => mockWebViewState.props !== null,
  /** How many times the challenge has been (re)mounted — the app remounts it after each failure. */
  mounts: (): number => mockWebViewState.mounts,
  html: (): string => webView().source?.html ?? '',

  async emit(message: unknown): Promise<void> {
    await act(() => {
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
