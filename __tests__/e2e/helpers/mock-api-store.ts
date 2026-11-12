/**
 * State of the in-memory Floatplane API (see mock-floatplane-api.ts): accounts, sessions, content,
 * scripted failures, and the requests the app sent. Route handlers live in mock-api-*-routes.ts.
 */

import {
  fixtureCreators,
  fixtureSubscriptions,
  gamingCreator,
  makeChannelVideos,
  techCreator,
} from '@test/fixtures';
import type { PostComment } from '@/hooks/use-post-comments';
import type { Creator, Subscription, Video, VideoDelivery, VideoPost } from '@/shared';

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

/** How many matching requests fail, and (optionally) which requests to the path count. */
export interface FailureOptions {
  count?: number;
  where?: (req: RecordedRequest) => boolean;
}

interface QueuedFailure {
  remaining: number;
  response: MockResponse;
  where: ((req: RecordedRequest) => boolean) | undefined;
}

interface Account {
  username: string;
  email: string;
  password: string;
  /** 2FA code required after the password step, or null when 2FA is off. */
  twoFactorCode: string | null;
  emailConfirmed: boolean;
}

export interface NotificationSetting {
  contentFirebase: boolean;
  contentEmail: boolean;
}

export const apiError = (status: number, name: string, message: string): MockResponse => ({
  status,
  body: { id: name, message, errors: [{ id: name, name, message }] },
});

const defaultAccount = (): Account => ({
  username: 'testuser',
  email: 'test@example.com',
  password: 'hunter2',
  twoFactorCode: null,
  emailConfirmed: true,
});

export class FloatplaneApiStore {
  requests: RecordedRequest[] = [];

  account: Account = defaultAccount();
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
  /**
   * The signed-in user's watch history ({ video, progress, updatedAt }; GET sorts by updatedAt,
   * newest first). POSTing watch progress upserts the post to the front, like the real backend,
   * so the "watch a video → see it in history" loop works end-to-end.
   */
  history: { video: Video; progress: number; updatedAt: string }[] = [];
  /** Page size of GET /api/v3/content/history (the server chooses it; 20 like the TV app). */
  historyPageSize = 20;
  /** Post overrides: id → post (defaults are derived from `videos` + `interactions` + `progress`). */
  posts = new Map<string, VideoPost>();
  /** Comment overrides: postId → list (default: 3 comments per post). */
  comments = new Map<string, PostComment[]>();
  /** Delivery overrides: attachment guid → payload (default: playable delivery). */
  deliveries = new Map<string, VideoDelivery>();
  /** Related-posts overrides: post id → list (default: up to 5 other videos from its channel). */
  related = new Map<string, Video[]>();
  /** Livestream ids currently broadcasting (delivery info answers 404 for the rest). */
  liveNow = new Set<string>();
  /** Hand out live delivery info for offline streams too (only their playlist 404s), like the real API. */
  liveDeliveryWhenOffline = false;
  /** Live delivery overrides: livestream id → payload (default: makeLiveDelivery). */
  liveDeliveries = new Map<string, VideoDelivery>();
  /** The signed-in user's reaction per post, as toggled through like/dislike. */
  interactions = new Map<string, 'like' | 'dislike' | null>();

  /** Per-creator notification switches (unset creators: push on, email off, like Floatplane). */
  notificationSettings = new Map<string, NotificationSetting>();

  /** Simulated network latency (ms of fake time) applied to every response. */
  latencyMs = 0;

  private readonly failures = new Map<string, QueuedFailure>();
  private tokenCounter = 0;

  constructor() {
    this.registerDefaultVideos();
  }

  reset(): void {
    this.requests = [];
    this.account = defaultAccount();
    this.captchaEnabled = true;
    this.issuedCaptchaTokens.clear();
    this.sessions.clear();
    this.pendingSessions.clear();
    this.revokedSessions = [];
    this.subscriptions = fixtureSubscriptions;
    this.creators = fixtureCreators;
    this.resetContent();
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
      if (list) {
        return list;
      }
    }
    return [];
  }

  setChannelVideos(creatorId: string, channelId: string, list: Video[]): void {
    const byChannel = this.videos.get(creatorId) ?? new Map<string, Video[]>();
    byChannel.set(channelId, list);
    this.videos.set(creatorId, byChannel);
  }

  /** Upsert a watch-history entry for a video (the latest progress + updatedAt win). */
  seedHistoryEntry(video: Video, progress: number, updatedAt = '2026-01-15T12:00:00.000Z'): void {
    const existing = this.history.find((entry) => entry.video.id === video.id);
    if (existing) {
      existing.progress = progress;
      existing.updatedAt = updatedAt;
    } else {
      this.history.push({ video, progress, updatedAt });
    }
  }

  /**
   * Make the next `count` (default 1) requests to `route` (`'GET /api/v3/…'`) fail with `response`.
   * `where` narrows which requests to the path count (e.g. only on-demand or only live delivery checks).
   */
  failRequests(
    route: string,
    response: MockResponse,
    { count = 1, where }: FailureOptions = {},
  ): void {
    const [method = '', path = ''] = route.split(' ');
    this.failures.set(`${method.toUpperCase()} ${path}`, { remaining: count, response, where });
  }

  requestsTo(path: string, method?: string): RecordedRequest[] {
    return this.requests.filter(
      (req) => req.path === path && (method === undefined || req.method === method.toUpperCase()),
    );
  }

  /** Delivery info requests of one kind: video playback (`onDemand`) or livestream status checks (`live`). */
  deliveryRequests(scenario: 'onDemand' | 'live'): RecordedRequest[] {
    return this.requestsTo('/api/v3/delivery/info').filter(
      (req) => req.params.get('scenario') === scenario,
    );
  }

  /** Settings for one creator (defaults when never changed). */
  notificationSettingFor(creatorId: string): NotificationSetting {
    return (
      this.notificationSettings.get(creatorId) ?? { contentFirebase: true, contentEmail: false }
    );
  }

  /** A video by id from any creator/channel registered in the content store. */
  findVideo(id: string): Video | undefined {
    return [...this.videos.values()]
      .flatMap((byChannel) => [...byChannel.values()].flat())
      .find((v) => v.id === id);
  }

  nextToken(prefix: string): string {
    this.tokenCounter += 1;
    return `${prefix}-${String(this.tokenCounter)}`;
  }

  /** The scripted failure for `req`, if one is queued (and consumes one of its repetitions). */
  consumeFailure(req: RecordedRequest): MockResponse | null {
    const key = `${req.method} ${req.path}`;
    const queued = this.failures.get(key);
    if (!queued || (queued.where !== undefined && !queued.where(req))) {
      return null;
    }
    queued.remaining -= 1;
    if (queued.remaining <= 0) {
      this.failures.delete(key);
    }
    return queued.response;
  }

  private resetContent(): void {
    this.videos.clear();
    this.progress.clear();
    this.history = [];
    this.historyPageSize = 20;
    this.posts.clear();
    this.comments.clear();
    this.deliveries.clear();
    this.liveNow.clear();
    this.liveDeliveryWhenOffline = false;
    this.related.clear();
    this.liveDeliveries.clear();
    this.interactions.clear();
    this.notificationSettings.clear();
  }

  private registerDefaultVideos(): void {
    [techCreator, gamingCreator].forEach((creator) => {
      creator.channels.forEach((channel, slot) => {
        this.setChannelVideos(creator.id, channel.id, makeChannelVideos(creator, channel, slot));
      });
    });
  }
}
