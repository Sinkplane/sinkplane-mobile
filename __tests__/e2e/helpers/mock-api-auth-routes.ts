/**
 * Mock Floatplane endpoints that work without a session: captcha info, password login, 2FA, logout.
 */

import { fixtureUser } from '@test/fixtures';

import {
  apiError,
  type FloatplaneApiStore,
  type MockResponse,
  type RecordedRequest,
  TURNSTILE_SITE_KEY,
} from './mock-api-store';

export type RouteHandler = (store: FloatplaneApiStore, req: RecordedRequest) => MockResponse;

const ok = (body: unknown): MockResponse => ({ status: 200, body });

/** Accepts (and consumes) a captcha token the mock Turnstile widget issued. */
function captchaRejected(store: FloatplaneApiStore, captchaToken: unknown): boolean {
  if (!store.captchaEnabled) {
    return false;
  }
  return typeof captchaToken !== 'string' || !store.issuedCaptchaTokens.delete(captchaToken);
}

/** Why the credentials are refused, or null when they match the account. */
function credentialsError(
  store: FloatplaneApiStore,
  body: Record<string, unknown>,
): MockResponse | null {
  const { username, password } = body;
  const { account } = store;
  const matchesUser = username === account.username || username === account.email;
  if (!matchesUser || password !== account.password) {
    return apiError(401, 'invalidUsernameOrPasswordError', 'Invalid username or password.');
  }
  if (!account.emailConfirmed) {
    return apiError(403, 'emailNotConfirmedError', 'Email not confirmed.');
  }
  return null;
}

/** A session token, or a pending one when the account needs a 2FA code first. */
function issueSession(store: FloatplaneApiStore): MockResponse {
  if (store.account.twoFactorCode !== null) {
    const pending = store.nextToken('pending');
    store.pendingSessions.add(pending);
    return ok({ needs2FA: true, token: pending });
  }
  return ok({ needs2FA: false, user: fixtureUser, token: store.createSession() });
}

function login(store: FloatplaneApiStore, req: RecordedRequest): MockResponse {
  const body = req.body ?? {};
  if (captchaRejected(store, body['captchaToken'])) {
    return apiError(400, 'invalidCaptchaTokenError', 'The captcha token is invalid or expired.');
  }
  const refused = credentialsError(store, body);
  if (refused) {
    return refused;
  }
  if (body['returnSessionToken'] !== true) {
    return ok({ needs2FA: false, user: fixtureUser });
  }
  return issueSession(store);
}

function checkFor2fa(store: FloatplaneApiStore, req: RecordedRequest): MockResponse {
  if (req.bearer === null || !store.pendingSessions.has(req.bearer)) {
    return apiError(401, 'unauthorizedError', 'No pending login.');
  }
  if (req.body?.['token'] !== store.account.twoFactorCode) {
    return apiError(400, 'invalid2faCodeError', 'The two-factor code is incorrect.');
  }
  store.pendingSessions.delete(req.bearer);
  store.sessions.add(req.bearer);
  return ok({ needs2FA: false, user: fixtureUser });
}

function logout(store: FloatplaneApiStore, req: RecordedRequest): MockResponse {
  if (req.bearer !== null && store.sessions.delete(req.bearer)) {
    store.revokedSessions.push(req.bearer);
    return ok('OK');
  }
  return apiError(401, 'unauthorizedError', 'Not signed in.');
}

function captchaInfo(store: FloatplaneApiStore): MockResponse {
  return ok(
    store.captchaEnabled
      ? { turnstile: { variants: { managed: { siteKey: TURNSTILE_SITE_KEY } } } }
      : {},
  );
}

/** Endpoints that work without a session, by `METHOD /path`. */
export const PUBLIC_ROUTES = new Map<string, RouteHandler>([
  ['GET /api/v3/auth/captcha/info', captchaInfo],
  ['POST /api/v3/auth/login', login],
  ['POST /api/v3/auth/checkFor2faLogin', checkFor2fa],
  ['POST /api/v3/auth/logout', logout],
]);
