/**
 * In-memory Floatplane API used by the E2E suite.
 *
 * Replaces `global.fetch` and serves every endpoint the mobile app talks to:
 *  - password login: captcha info, login (+ Turnstile token check), 2FA, logout
 *  - profile (/status), subscriptions, creator list
 *  - creator content listing (all channels or one), with pagination + sort
 *  - video page: post by id, delivery info, paged comments, like/dislike toggles
 *  - livestreams: live delivery info for streams in `liveNow`, 404 for offline ones (like the real API);
 *    their playlists on live.floatplane.test (404 while offline; see `liveDeliveryWhenOffline`)
 *  - watch progress (get + set) and watch history (offset-paged; POSTing progress moves the
 *    post to the front of the history, like the real backend)
 *  - per-creator notification settings (list + update; one entry per subscribed creator)
 *
 * It is stateful (sessions are issued and revoked like the real backend), lets tests script
 * failures, and records every request so tests can assert what the app sent. State lives in
 * mock-api-store.ts, the endpoints in mock-api-*-routes.ts.
 */

import { PUBLIC_ROUTES } from './mock-api-auth-routes';
import { CONTENT_ROUTES } from './mock-api-content-routes';
import {
  apiError,
  FloatplaneApiStore,
  type MockResponse,
  NETWORK_ERROR,
  type RecordedRequest,
} from './mock-api-store';
import { VIDEO_PAGE_ROUTES } from './mock-api-video-routes';

export {
  NETWORK_ERROR,
  TURNSTILE_SITE_KEY,
  type FailureOptions,
  type MockResponse,
  type RecordedRequest,
} from './mock-api-store';

/** The subset of a fetch Response the app reads. */
function respond({ status, body }: MockResponse): Response {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    json(): Promise<unknown> {
      if (typeof body === 'string') {
        return Promise.reject(new SyntaxError('Unexpected token < in JSON'));
      }
      return Promise.resolve(body);
    },
    text(): Promise<string> {
      return Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body));
    },
  };
  return response as unknown as Response;
}

function requestUrl(input: RequestInfo | URL): URL {
  if (typeof input === 'string') {
    return new URL(input);
  }
  return new URL(input instanceof URL ? input.href : input.url);
}

/** Request headers by lower-cased name (the app passes plain header objects). */
function headerMap(init: RequestInit | undefined): Map<string, string> {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  return new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

function parseBody(init: RequestInit | undefined): Record<string, unknown> | null {
  return typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
}

function toRecordedRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): RecordedRequest {
  const url = requestUrl(input);
  const headers = headerMap(init);
  const auth = headers.get('authorization');
  return {
    method: (init?.method ?? 'GET').toUpperCase(),
    path: url.pathname,
    params: url.searchParams,
    body: parseBody(init),
    bearer: auth?.startsWith('Bearer ') === true ? auth.slice('Bearer '.length) : null,
    userAgent: headers.get('user-agent') ?? null,
  };
}

export class FloatplaneApiMock extends FloatplaneApiStore {
  // -- fetch entry point ------------------------------------------------------------------

  handleFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = toRecordedRequest(input, init);
    this.requests.push(request);

    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }

    const failure = this.consumeFailure(request);
    // Compared by value: tests import NETWORK_ERROR from a different module registry than this instance.
    if (failure?.status === NETWORK_ERROR.status) {
      throw new TypeError('Network request failed');
    }
    if (failure) {
      return respond(failure);
    }
    return respond(this.routeByHost(requestUrl(input), request));
  };

  private routeByHost(url: URL, request: RecordedRequest): MockResponse {
    if (url.hostname === 'live.floatplane.test') {
      return this.livePlaylist(url.pathname);
    }
    if (url.hostname !== 'www.floatplane.com') {
      return { status: 404, body: `No mock for ${url.href}` };
    }
    return this.route(request);
  }

  /** A live HLS playlist (`/<liveStreamId>/<variant>.m3u8`): served while live, else 404 like the CDN. */
  private livePlaylist(pathname: string): MockResponse {
    const liveStreamId = pathname.split('/')[1] ?? '';
    return this.liveNow.has(liveStreamId)
      ? { status: 200, body: '#EXTM3U' }
      : { status: 404, body: 'Not Found' };
  }

  // -- routing ----------------------------------------------------------------------------

  private route(req: RecordedRequest): MockResponse {
    const route = `${req.method} ${req.path}`;
    const publicHandler = PUBLIC_ROUTES.get(route);
    if (publicHandler) {
      return publicHandler(this, req);
    }
    if (req.bearer === null || !this.sessions.has(req.bearer)) {
      return apiError(401, 'unauthorizedError', 'You must be signed in to do that.');
    }
    const handler = VIDEO_PAGE_ROUTES.get(route) ?? CONTENT_ROUTES.get(route);
    return handler
      ? handler(this, req)
      : { status: 404, body: { message: `No mock handler for ${route}` } };
  }
}

export const api = new FloatplaneApiMock();

/**
 * Route every fetch the app makes through `api`.
 *
 * Non-configurable on purpose: expo's winter runtime installs its own fetch global when the app
 * loads and refuses to clobber a non-configurable descriptor, which keeps the mock in charge.
 * `writable` lets each per-test module reset (helpers/runtime.ts) rebind the fresh instance.
 */
Object.defineProperty(globalThis, 'fetch', {
  value: (input: RequestInfo | URL, init?: RequestInit) => api.handleFetch(input, init),
  writable: true,
  enumerable: true,
  configurable: false,
});
