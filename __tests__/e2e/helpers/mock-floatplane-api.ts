/**
 * In-memory Floatplane API used by the E2E suite.
 *
 * Replaces `global.fetch` and serves every endpoint the mobile app talks to:
 *  - password login: captcha info, login (+ Turnstile token check), 2FA, logout
 *  - profile (/status), subscriptions, creator list
 *  - creator content listing (all channels or one), with pagination + sort
 *  - watch progress
 *
 * It is stateful (sessions are issued and revoked like the real backend), lets tests script
 * failures, and records every request so tests can assert what the app sent.
 */

import { fixtureCreators, fixtureSubscriptions, fixtureUser, gamingCreator, makeChannelVideos, techCreator } from '@test/fixtures';
import type { Creator, Subscription, Video } from '@/shared';

export const TURNSTILE_SITE_KEY = '0x4AAAAAAATestSiteKey';

export interface RecordedRequest {
  method: string;
  path: string;
  params: URLSearchParams;
  body: Record<string, unknown> | null;
  bearer: string | null;
  userAgent: string | null;
}

export interface MockResponse {
  status: number;
  body: unknown;
}

/** Pass to failRequests() to make fetch reject (offline / DNS / TLS failure) instead of responding. */
export const NETWORK_ERROR: MockResponse = { status: 0, body: null };

interface Account {
  username: string;
  email: string;
  password: string;
  /** 2FA code required after the password step, or null when 2FA is off. */
  twoFactorCode: string | null;
  emailConfirmed: boolean;
}

const apiError = (status: number, name: string, message: string): MockResponse => ({
  status,
  body: { id: name, message, errors: [{ id: name, name, message }] },
});

/** The subset of a fetch Response the app reads. */
function respond({ status, body }: MockResponse): Response {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    async json(): Promise<unknown> {
      if (typeof body === 'string') throw new SyntaxError('Unexpected token < in JSON');
      return body;
    },
    async text(): Promise<string> {
      return typeof body === 'string' ? body : JSON.stringify(body);
    },
  };
  return response as unknown as Response;
}

export class FloatplaneApiMock {
  requests: RecordedRequest[] = [];

  account: Account = this.defaultAccount();
  /** Turnstile is enforced (captcha info returns a managed site key) unless disabled. */
  captchaEnabled = true;
  /** Captcha tokens the (mock) Turnstile widget issued and the login endpoint will accept once. */
  issuedCaptchaTokens = new Set<string>();
  /** Fully authenticated session tokens. */
  sessions = new Set<string>();
  /** Tokens waiting for a 2FA code. */
  pendingSessions = new Set<string>();
  revokedSessions: string[] = [];

  subscriptions: Subscription[] = fixtureSubscriptions;
  creators: Creator[] = fixtureCreators;
  /** creatorId → channelId → videos (newest first). */
  videos = new Map<string, Map<string, Video[]>>();
  progress = new Map<string, number>();

  /** Simulated network latency (ms of fake time) applied to every response. */
  latencyMs = 0;

  private failures = new Map<string, { remaining: number; response: MockResponse }>();
  private tokenCounter = 0;

  constructor() {
    this.registerDefaultVideos();
  }

  reset(): void {
    this.requests = [];
    this.account = this.defaultAccount();
    this.captchaEnabled = true;
    this.issuedCaptchaTokens.clear();
    this.sessions.clear();
    this.pendingSessions.clear();
    this.revokedSessions = [];
    this.subscriptions = fixtureSubscriptions;
    this.creators = fixtureCreators;
    this.videos.clear();
    this.progress.clear();
    this.failures.clear();
    this.latencyMs = 0;
    this.tokenCounter = 0;
    this.registerDefaultVideos();
  }

  // -- setup helpers ----------------------------------------------------------------------

  /** Issue a session token directly (used to seed an already-signed-in launch). */
  createSession(): string {
    const token = this.nextToken('session');
    this.sessions.add(token);
    return token;
  }

  /** What the Turnstile widget hands the app after a solved challenge. */
  issueCaptchaToken(): string {
    const token = this.nextToken('cf-turnstile');
    this.issuedCaptchaTokens.add(token);
    return token;
  }

  channelVideos(channelId: string): Video[] {
    for (const byChannel of this.videos.values()) {
      const list = byChannel.get(channelId);
      if (list) return list;
    }
    return [];
  }

  setChannelVideos(creatorId: string, channelId: string, list: Video[]): void {
    const byChannel = this.videos.get(creatorId) ?? new Map<string, Video[]>();
    byChannel.set(channelId, list);
    this.videos.set(creatorId, byChannel);
  }

  /** Make the next `count` matching requests fail with `response`. */
  failRequests(method: string, path: string, response: MockResponse, count = 1): void {
    this.failures.set(`${method.toUpperCase()} ${path}`, { remaining: count, response });
  }

  requestsTo(path: string, method?: string): RecordedRequest[] {
    return this.requests.filter(req => req.path === path && (!method || req.method === method.toUpperCase()));
  }

  // -- fetch entry point ------------------------------------------------------------------

  handleFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = Object.fromEntries(Object.entries(init?.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const auth = headers.authorization;
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;

    this.requests.push({
      method,
      path: url.pathname,
      params: url.searchParams,
      body,
      bearer: auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null,
      userAgent: headers['user-agent'] ?? null,
    });
    const request = this.requests[this.requests.length - 1];

    if (this.latencyMs > 0) await new Promise(resolve => setTimeout(resolve, this.latencyMs));

    const failure = this.consumeFailure(method, url.pathname);
    // Compared by value: tests import NETWORK_ERROR from a different module registry than this instance.
    if (failure?.status === NETWORK_ERROR.status) throw new TypeError('Network request failed');
    if (failure) return respond(failure);
    if (url.hostname !== 'www.floatplane.com') return respond({ status: 404, body: `No mock for ${url.href}` });

    return respond(this.route(request));
  };

  // -- routing ----------------------------------------------------------------------------

  private route(req: RecordedRequest): MockResponse {
    const route = `${req.method} ${req.path}`;
    const authResponse = this.routeAuth(route, req);
    if (authResponse) return authResponse;

    if (!req.bearer || !this.sessions.has(req.bearer)) {
      return apiError(401, 'unauthorizedError', 'You must be signed in to do that.');
    }
    return this.routeContent(route, req);
  }

  /** Endpoints that work without a session. */
  private routeAuth(route: string, req: RecordedRequest): MockResponse | null {
    switch (route) {
      case 'GET /api/v3/auth/captcha/info':
        return { status: 200, body: this.captchaEnabled ? { turnstile: { variants: { managed: { siteKey: TURNSTILE_SITE_KEY } } } } : {} };
      case 'POST /api/v3/auth/login':
        return this.login(req.body ?? {});
      case 'POST /api/v3/auth/checkFor2faLogin':
        return this.checkFor2fa(req);
      case 'POST /api/v3/auth/logout':
        return this.logout(req);
      default:
        return null;
    }
  }

  /** Endpoints that require a valid session token. */
  private routeContent(route: string, req: RecordedRequest): MockResponse {
    switch (route) {
      case 'GET /api/v3/status':
        return { status: 200, body: { selfUser: fixtureUser, selfCreator: null, serviceMessages: [], serviceDenied: null } };
      case 'GET /api/v3/user/subscriptions':
        return { status: 200, body: this.subscriptions };
      case 'GET /api/v3/creator/list': {
        const ids = this.indexedParams(req.params);
        return { status: 200, body: ids.map(id => this.creators.find(c => c.id === id)).filter(Boolean) };
      }
      case 'GET /api/v3/content/creator':
        return this.contentCreator(req.params);
      case 'GET /api/v3/content/progress': {
        const ids = this.indexedParams(req.params);
        return { status: 200, body: ids.filter(id => this.progress.has(id)).map(id => ({ id, progress: this.progress.get(id) })) };
      }
      default:
        return { status: 404, body: { message: `No mock handler for ${route}` } };
    }
  }

  private login(body: Record<string, unknown>): MockResponse {
    const { username, password, captchaToken, returnSessionToken } = body;
    if (this.captchaEnabled) {
      if (typeof captchaToken !== 'string' || !this.issuedCaptchaTokens.delete(captchaToken)) {
        return apiError(400, 'invalidCaptchaTokenError', 'The captcha token is invalid or expired.');
      }
    }
    const matchesUser = username === this.account.username || username === this.account.email;
    if (!matchesUser || password !== this.account.password) {
      return apiError(401, 'invalidUsernameOrPasswordError', 'Invalid username or password.');
    }
    if (!this.account.emailConfirmed) {
      return apiError(403, 'emailNotConfirmedError', 'Email not confirmed.');
    }
    if (!returnSessionToken) return { status: 200, body: { needs2FA: false, user: fixtureUser } };

    if (this.account.twoFactorCode) {
      const pending = this.nextToken('pending');
      this.pendingSessions.add(pending);
      return { status: 200, body: { needs2FA: true, token: pending } };
    }
    return { status: 200, body: { needs2FA: false, user: fixtureUser, token: this.createSession() } };
  }

  private checkFor2fa(req: RecordedRequest): MockResponse {
    if (!req.bearer || !this.pendingSessions.has(req.bearer)) {
      return apiError(401, 'unauthorizedError', 'No pending login.');
    }
    if (req.body?.token !== this.account.twoFactorCode) {
      return apiError(400, 'invalid2faCodeError', 'The two-factor code is incorrect.');
    }
    this.pendingSessions.delete(req.bearer);
    this.sessions.add(req.bearer);
    return { status: 200, body: { needs2FA: false, user: fixtureUser } };
  }

  private logout(req: RecordedRequest): MockResponse {
    if (req.bearer && this.sessions.delete(req.bearer)) {
      this.revokedSessions.push(req.bearer);
      return { status: 200, body: 'OK' };
    }
    return apiError(401, 'unauthorizedError', 'Not signed in.');
  }

  private contentCreator(params: URLSearchParams): MockResponse {
    const byChannel = this.videos.get(params.get('id') ?? '');
    if (!byChannel) return { status: 200, body: [] };

    const channel = params.get('channel');
    const all = channel
      ? (byChannel.get(channel) ?? [])
      : [...byChannel.values()].flat().sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));
    const ordered = params.get('sort') === 'ASC' ? [...all].reverse() : all;
    const fetchAfter = Number(params.get('fetchAfter') ?? 0);
    const limit = Number(params.get('limit') ?? 10);
    return { status: 200, body: ordered.slice(fetchAfter, fetchAfter + limit) };
  }

  // -- internals ----------------------------------------------------------------------------

  private defaultAccount(): Account {
    return { username: 'testuser', email: 'test@example.com', password: 'hunter2', twoFactorCode: null, emailConfirmed: true };
  }

  private registerDefaultVideos(): void {
    [techCreator, gamingCreator].forEach(creator => {
      creator.channels.forEach((channel, slot) => this.setChannelVideos(creator.id, channel.id, makeChannelVideos(creator, channel, slot)));
    });
  }

  private nextToken(prefix: string): string {
    this.tokenCounter += 1;
    return `${prefix}-${this.tokenCounter}`;
  }

  private consumeFailure(method: string, path: string): MockResponse | null {
    const key = `${method} ${path}`;
    const queued = this.failures.get(key);
    if (!queued) return null;
    queued.remaining -= 1;
    if (queued.remaining <= 0) this.failures.delete(key);
    return queued.response;
  }

  private indexedParams(params: URLSearchParams): string[] {
    const ids: string[] = [];
    params.forEach((value, key) => {
      const match = /^ids\[(\d+)\]$/.exec(key);
      if (match) ids[Number(match[1])] = value;
    });
    return ids;
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
