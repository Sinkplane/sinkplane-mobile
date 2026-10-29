/**
 * E2E: username/password sign-in — Turnstile gating, credential + captcha errors, 2FA, and
 * restoring / losing a persisted session.
 */
import { StyleSheet } from 'react-native';

import { NETWORK_ERROR, TURNSTILE_SITE_KEY } from './helpers/mock-floatplane-api';
import { loadRuntime, type Runtime } from './helpers/runtime';

const EMAIL_NOT_CONFIRMED = 'Your email address has not been confirmed yet. Check your inbox for the confirmation email before signing in.';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

const signInButton = () => rt.screen.getByText('Sign In');

async function openSignIn() {
  await rt.renderApp();
  await rt.until(() => expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy());
}

async function enterCredentials(username = 'testuser', password = 'hunter2') {
  await rt.fireEvent.changeText(rt.screen.getByPlaceholderText('Username or email'), username);
  await rt.fireEvent.changeText(rt.screen.getByPlaceholderText('Password'), password);
}

async function expectSignedIn() {
  await rt.until(() => expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy());
  expect(rt.selectedTab()).toBe('index');
  expect(rt.screen.queryByText('Sign in to Floatplane')).toBeNull();
}

const loginRequests = () => rt.api.requestsTo('/api/v3/auth/login', 'POST');

describe('sign-in screen', () => {
  it('renders white text on the photo background, with a dark Turnstile challenge', async () => {
    await openSignIn();

    expect(StyleSheet.flatten(rt.screen.getByText('Sign in to Floatplane').props.style).color).toBe('#fff');
    await rt.until(() => expect(rt.turnstile.mounted()).toBe(true));
    expect(rt.turnstile.html()).toContain(`sitekey: "${TURNSTILE_SITE_KEY}"`);
    // The screen is always light-on-dark, regardless of the app theme.
    expect(rt.turnstile.html()).toContain('theme: "dark"');
  });

  it('keeps Sign In disabled until the captcha challenge is solved', async () => {
    await openSignIn();
    await enterCredentials();

    await rt.until(() => expect(rt.screen.getByText('Loading challenge…')).toBeTruthy());
    expect(signInButton()).toBeDisabled();

    await rt.turnstile.emit({ type: 'load' });
    expect(rt.screen.getByText('Complete the challenge above')).toBeTruthy();
    expect(signInButton()).toBeDisabled();

    await rt.turnstile.solve();
    expect(rt.screen.getByText('Captcha verified')).toBeTruthy();
    expect(signInButton()).toBeEnabled();
  });

  it('signs in with username + password and lands on the Videos tab', async () => {
    await openSignIn();
    await rt.until(() => expect(rt.turnstile.mounted()).toBe(true));
    const captchaToken = await rt.turnstile.solve();
    await enterCredentials();

    await rt.fireEvent.press(signInButton());
    await expectSignedIn();

    const [login] = loginRequests();
    expect(login.body).toEqual({ username: 'testuser', password: 'hunter2', captchaToken, returnSessionToken: true });
    // Cloudflare bot management: every request must look like a browser.
    expect(login.userAgent).toMatch(/^Mozilla\/5\.0/);

    // The session survives a restart.
    const token = JSON.parse(rt.secureStore.get('fptoken') ?? 'null');
    expect(rt.api.sessions.has(token)).toBe(true);
    expect(rt.api.requestsTo('/api/v3/status').at(-1)?.bearer).toBe(token);
  });

  it('accepts an email address, trims whitespace, and submits from the keyboard', async () => {
    await openSignIn();
    await rt.until(() => expect(rt.turnstile.mounted()).toBe(true));
    await rt.turnstile.solve();
    await enterCredentials('  test@example.com ', 'hunter2');

    await rt.fireEvent(rt.screen.getByPlaceholderText('Password'), 'submitEditing');
    await expectSignedIn();
    expect(loginRequests()[0].body?.username).toBe('test@example.com');
  });

  it('does not submit with an empty username or password', async () => {
    await openSignIn();
    await rt.until(() => expect(rt.turnstile.mounted()).toBe(true));
    await rt.turnstile.solve();

    await rt.fireEvent.changeText(rt.screen.getByPlaceholderText('Username or email'), '   ');
    await rt.fireEvent(rt.screen.getByPlaceholderText('Password'), 'submitEditing');
    await rt.fireEvent.press(signInButton());

    await rt.advanceTime(500);
    expect(loginRequests()).toHaveLength(0);
  });

  it('toggles password visibility', async () => {
    await openSignIn();
    const password = rt.screen.getByPlaceholderText('Password');
    expect(password.props.secureTextEntry).toBe(true);

    await rt.fireEvent.press(rt.screen.getByText('Show'));
    expect(rt.screen.getByPlaceholderText('Password').props.secureTextEntry).toBe(false);

    await rt.fireEvent.press(rt.screen.getByText('Hide'));
    expect(rt.screen.getByPlaceholderText('Password').props.secureTextEntry).toBe(true);
  });

  it('signs in without a captcha token when Floatplane does not require one', async () => {
    rt.api.captchaEnabled = false;
    await openSignIn();
    await rt.until(() => expect(rt.screen.getByText('Captcha not required.')).toBeTruthy());
    expect(rt.turnstile.mounted()).toBe(false);

    await enterCredentials();
    await rt.fireEvent.press(signInButton());

    await expectSignedIn();
    expect(loginRequests()[0].body).not.toHaveProperty('captchaToken');
  });
});

describe('sign-in failures', () => {
  async function attemptSignIn(username: string, password: string) {
    await rt.until(() => expect(rt.turnstile.mounted()).toBe(true));
    await rt.turnstile.solve();
    await enterCredentials(username, password);
    await rt.fireEvent.press(signInButton());
  }

  it('shows the API error for a wrong password, keeps the captcha, and succeeds on retry', async () => {
    await openSignIn();
    await attemptSignIn('testuser', 'wrong');

    await rt.until(() => expect(rt.screen.getByText('Invalid username or password.')).toBeTruthy());
    // Wrong credentials are not a captcha problem — the solved widget is left alone.
    expect(rt.turnstile.mounts()).toBe(1);

    // Turnstile tokens are single-use; the next attempt needs a fresh one from the widget.
    await rt.turnstile.solve();
    await rt.fireEvent.changeText(rt.screen.getByPlaceholderText('Password'), 'hunter2');
    await rt.fireEvent.press(signInButton());

    await expectSignedIn();
  });

  it('resets the Turnstile widget when the server rejects the captcha token', async () => {
    await openSignIn();
    await rt.until(() => expect(rt.turnstile.mounted()).toBe(true));
    await rt.turnstile.emit({ type: 'load' });
    await rt.turnstile.emit({ type: 'token', token: 'forged-token' });
    await enterCredentials();
    await rt.fireEvent.press(signInButton());

    await rt.until(() => expect(rt.screen.getByText('The captcha token is invalid or expired.')).toBeTruthy());
    expect(rt.turnstile.mounts()).toBe(2);
    expect(rt.screen.getByText('Loading challenge…')).toBeTruthy();
    expect(signInButton()).toBeDisabled();
  });

  it('explains when the account email is not confirmed', async () => {
    rt.api.account.emailConfirmed = false;
    await openSignIn();
    await attemptSignIn('testuser', 'hunter2');

    await rt.until(() => expect(rt.screen.getByText(EMAIL_NOT_CONFIRMED)).toBeTruthy());
  });

  it('shows a generic error and a fresh challenge when the request never reaches Floatplane', async () => {
    rt.api.failRequests('POST', '/api/v3/auth/login', NETWORK_ERROR);
    await openSignIn();
    await attemptSignIn('testuser', 'hunter2');

    await rt.until(() => expect(rt.screen.getByText('Network request failed')).toBeTruthy());
    expect(rt.turnstile.mounts()).toBe(2);
  });

  it('reports a profile failure after a successful login and stays on sign-in', async () => {
    rt.api.failRequests('GET', '/api/v3/status', { status: 503, body: 'Service Unavailable' });
    await openSignIn();
    await attemptSignIn('testuser', 'hunter2');

    await rt.until(() => expect(rt.screen.getByText('Failed to fetch profile: 503 - Service Unavailable')).toBeTruthy());
    expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy();
  });

  it('reports a profile response without a user', async () => {
    await openSignIn();
    await rt.until(() => expect(rt.turnstile.mounted()).toBe(true));
    rt.api.failRequests('GET', '/api/v3/status', { status: 200, body: { selfUser: null } });
    await attemptSignIn('testuser', 'hunter2');

    await rt.until(() => expect(rt.screen.getByText('No user data returned from profile')).toBeTruthy());
  });
});

describe('captcha availability', () => {
  it('retries loading the captcha requirements', async () => {
    rt.api.failRequests('GET', '/api/v3/auth/captcha/info', { status: 500, body: { message: 'Captcha service down' } });
    await openSignIn();

    await rt.until(() => expect(rt.screen.getByText('Captcha service down')).toBeTruthy());
    expect(signInButton()).toBeDisabled();

    await rt.fireEvent.press(rt.screen.getByText('Retry'));
    await rt.until(() => expect(rt.turnstile.mounted()).toBe(true));
    expect(rt.screen.queryByText('Captcha service down')).toBeNull();
  });

  it('falls back to a generic message when captcha info fails without a reason', async () => {
    rt.api.failRequests('GET', '/api/v3/auth/captcha/info', NETWORK_ERROR);
    await openSignIn();
    await rt.until(() => expect(rt.screen.getByText('Network request failed')).toBeTruthy());
  });

  it('lets the user reload a challenge that failed to render', async () => {
    await openSignIn();
    await rt.until(() => expect(rt.turnstile.mounted()).toBe(true));

    await rt.turnstile.fail('turnstile: 300010');
    expect(rt.screen.getByText('Captcha failed to load (turnstile: 300010)')).toBeTruthy();

    await rt.fireEvent.press(rt.screen.getByText('Retry'));
    expect(rt.turnstile.mounts()).toBe(2);
    expect(rt.screen.getByText('Loading challenge…')).toBeTruthy();
  });

  it('requires solving again after the captcha token expires', async () => {
    await openSignIn();
    await rt.until(() => expect(rt.turnstile.mounted()).toBe(true));
    await rt.turnstile.solve();
    await enterCredentials();
    expect(signInButton()).toBeEnabled();

    await rt.turnstile.emit({ type: 'expire' });
    expect(signInButton()).toBeDisabled();
    expect(rt.screen.getByText('Complete the challenge above')).toBeTruthy();
  });
});

describe('two-factor authentication', () => {
  beforeEach(() => {
    rt.api.account.twoFactorCode = '123456';
  });

  async function reachTwoFactor() {
    await openSignIn();
    await rt.until(() => expect(rt.turnstile.mounted()).toBe(true));
    await rt.turnstile.solve();
    await enterCredentials();
    await rt.fireEvent.press(signInButton());
    await rt.until(() => expect(rt.screen.getByText('Two-factor authentication')).toBeTruthy());
  }

  const codeInput = () => rt.screen.getByPlaceholderText('123456');
  const twoFactorRequests = () => rt.api.requestsTo('/api/v3/auth/checkFor2faLogin', 'POST');

  it('asks for a code after the password step and signs in with it', async () => {
    await reachTwoFactor();

    await rt.fireEvent.changeText(codeInput(), '123 456');
    await rt.fireEvent.press(rt.screen.getByText('Verify'));

    await expectSignedIn();
    const [check] = twoFactorRequests();
    expect(check.body).toEqual({ token: '123456' });
    // The pending login token becomes the session.
    expect(check.bearer).toBe(JSON.parse(rt.secureStore.get('fptoken') ?? 'null'));
  });

  it('shows an error for a wrong code and accepts the right one afterwards', async () => {
    await reachTwoFactor();

    await rt.fireEvent.changeText(codeInput(), '000000');
    await rt.fireEvent(codeInput(), 'submitEditing');
    await rt.until(() => expect(rt.screen.getByText('The two-factor code is incorrect.')).toBeTruthy());

    await rt.fireEvent.changeText(codeInput(), '123456');
    await rt.fireEvent(codeInput(), 'submitEditing');
    await expectSignedIn();
  });

  it('accepts a backup code', async () => {
    rt.api.account.twoFactorCode = 'abc123-def456';
    await reachTwoFactor();

    await rt.fireEvent.changeText(codeInput(), 'abc123-def456');
    await rt.fireEvent.press(rt.screen.getByText('Verify'));
    await expectSignedIn();
  });

  it('ignores codes that are not 6 digits or a backup code', async () => {
    await reachTwoFactor();

    await rt.fireEvent.changeText(codeInput(), '12345');
    await rt.fireEvent.press(rt.screen.getByText('Verify'));
    await rt.advanceTime(500);

    expect(twoFactorRequests()).toHaveLength(0);
    expect(rt.screen.getByText('Two-factor authentication')).toBeTruthy();
  });

  it('reports a network failure while verifying', async () => {
    await reachTwoFactor();
    rt.api.failRequests('POST', '/api/v3/auth/checkFor2faLogin', NETWORK_ERROR);

    await rt.fireEvent.changeText(codeInput(), '123456');
    await rt.fireEvent.press(rt.screen.getByText('Verify'));
    await rt.until(() => expect(rt.screen.getByText('Network request failed')).toBeTruthy());
  });

  it('goes back to the credentials step', async () => {
    await reachTwoFactor();

    await rt.fireEvent.press(rt.screen.getByText('Back to sign in'));

    expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy();
    expect(rt.screen.getByPlaceholderText('Username or email').props.value).toBe('testuser');
  });

  it('asks for 2FA even when the login response carries no token', async () => {
    rt.api.failRequests('POST', '/api/v3/auth/login', { status: 200, body: { needs2FA: false } });
    await openSignIn();
    await rt.until(() => expect(rt.turnstile.mounted()).toBe(true));
    await rt.turnstile.solve();
    await enterCredentials();
    await rt.fireEvent.press(signInButton());

    await rt.until(() => expect(rt.screen.getByText('Two-factor authentication')).toBeTruthy());
    // Without a pending token there is nothing to verify against.
    await rt.fireEvent.changeText(codeInput(), '123456');
    await rt.fireEvent.press(rt.screen.getByText('Verify'));
    await rt.advanceTime(500);
    expect(twoFactorRequests()).toHaveLength(0);
  });
});

describe('persisted session', () => {
  it('restores a saved session straight into the app', async () => {
    rt.seedSession();
    await rt.renderApp();
    await expectSignedIn();
    expect(loginRequests()).toHaveLength(0);
  });

  it('returns to sign-in when the saved session has been revoked', async () => {
    rt.seedSession({ token: 'revoked-token' });
    await rt.renderApp();

    await rt.until(() => expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy());
    expect(rt.secureStore.has('fptoken')).toBe(false);
  });
});
