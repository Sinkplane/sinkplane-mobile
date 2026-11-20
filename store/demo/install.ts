/**
 * Demo mode: the real app against the E2E suite's in-memory Floatplane API, loaded with the made-up
 * creators in jest/demo (store screenshots, see store/README.md). Only Floatplane's API and sync
 * socket are faked. Images and video come from store/demo/serve-media.sh.
 *
 * Dev only: metro.config.js bundles ./entry.ts (which loads this first) when SINKPLANE_DEMO=1.
 */

// Must stay the first import: it captures the native globals before the mocks below replace them.
import { NativeWebSocket, nativeFetch } from './natives';

import { LogBox, Platform } from 'react-native';

import { seedDemoWorld } from '@test/demo/world';

import { api } from '../../__tests__/e2e/helpers/mock-floatplane-api';
import { MockServerSocket } from '../../__tests__/e2e/helpers/mock-floatplane-socket';

const MEDIA_PORT = 8099;
/** The Android emulator reaches the host Mac at 10.0.2.2. */
// eslint-disable-next-line sonarjs/no-hardcoded-ip -- the emulator's fixed alias for the host machine
const MEDIA_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

const FLOATPLANE_HOST = 'www.floatplane.com';

function urlOf(input: RequestInfo | URL): URL {
  if (typeof input === 'string') {
    return new URL(input);
  }
  return new URL(input instanceof URL ? input.href : input.url);
}

/** Sessions survive a JS reload (the mock forgets the ones it issued; the app keeps its token). */
class DemoSessions extends Set<string> {
  override has(token: string): boolean {
    return token.startsWith('session-');
  }
}

function routeFetch(): void {
  globalThis.fetch = (input, init) =>
    urlOf(input).hostname === FLOATPLANE_HOST
      ? api.handleFetch(input, init)
      : nativeFetch(input, init);
}

function routeWebSocket(): void {
  function DemoWebSocket(
    url: string,
    protocols?: string | string[] | null,
    options?: { headers?: Record<string, string> },
  ): unknown {
    return url.includes(FLOATPLANE_HOST)
      ? new MockServerSocket(url, protocols, options)
      : new (NativeWebSocket as unknown as new (...args: unknown[]) => WebSocket)(
          url,
          protocols,
          options,
        );
  }
  Object.assign(DemoWebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  globalThis.WebSocket = DemoWebSocket as unknown as typeof WebSocket;
}

routeFetch();
routeWebSocket();
api.sessions = new DemoSessions();
seedDemoWorld(api, {
  mediaBaseUrl: `http://${MEDIA_HOST}:${String(MEDIA_PORT)}`,
  now: new Date(),
});
// Screenshots: no warning toasts.
LogBox.ignoreAllLogs();
