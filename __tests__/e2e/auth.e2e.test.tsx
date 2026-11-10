/**
 * E2E: username/password sign-in — Turnstile gating, credential + captcha errors. 2FA and the
 * persisted session are in auth-two-factor.e2e.test.tsx.
 */

import { NETWORK_ERROR, TURNSTILE_SITE_KEY } from './helpers/mock-floatplane-api';
import { loadRuntime, type Runtime } from './helpers/runtime';
import {
  enterCredentials,
  expectSignedIn,
  loginRequests,
  openSignIn,
  signInButton,
} from './helpers/sign-in-flows';

const EMAIL_NOT_CONFIRMED =
  'Your email address has not been confirmed yet. Check your inbox for the confirmation email before signing in.';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

describe('sign-in screen', () => {
  it('renders white text on the photo background, with a dark Turnstile challenge', async () => {
    await openSignIn(rt);

    expect(rt.styleOf(rt.screen.getByText('Sign in to Floatplane')).color).toBe('#fff');
    await rt.until(() => {
      expect(rt.turnstile.mounted()).toBe(true);
    });
    expect(rt.turnstile.html()).toContain(`sitekey: "${TURNSTILE_SITE_KEY}"`);
    // The screen is always light-on-dark, regardless of the app theme.
    expect(rt.turnstile.html()).toContain('theme: "dark"');
  });

  it('keeps Sign In disabled until the captcha challenge is solved', async () => {
    await openSignIn(rt);
    await enterCredentials(rt);

    await rt.until(() => {
      expect(rt.screen.getByText('Loading challenge…')).toBeTruthy();
    });
    expect(signInButton(rt)).toBeDisabled();

    await rt.turnstile.emit({ type: 'load' });
    expect(rt.screen.getByText('Complete the challenge above')).toBeTruthy();
    expect(signInButton(rt)).toBeDisabled();

    await rt.turnstile.solve();
    expect(rt.screen.getByText('Captcha verified')).toBeTruthy();
    expect(signInButton(rt)).toBeEnabled();
  });

  it('signs in with username + password and lands on the Videos tab', async () => {
    await openSignIn(rt);
    await rt.until(() => {
      expect(rt.turnstile.mounted()).toBe(true);
    });
    const captchaToken = await rt.turnstile.solve();
    await enterCredentials(rt);

    await rt.fireEvent.press(signInButton(rt));
    await expectSignedIn(rt);

    const login = rt.defined(loginRequests(rt)[0]);
    expect(login.body).toEqual({
      username: 'testuser',
      password: 'hunter2',
      captchaToken,
      returnSessionToken: true,
    });
    // Cloudflare bot management: every request must look like a browser.
    expect(login.userAgent).toMatch(/^Mozilla\/5\.0/);

    // The session survives a restart.
    const token = JSON.parse(rt.secureStore.get('fptoken') ?? 'null') as string;
    expect(rt.api.sessions.has(token)).toBe(true);
    expect(rt.api.requestsTo('/api/v3/status').at(-1)?.bearer).toBe(token);
  });

  it('accepts an email address, trims whitespace, and submits from the keyboard', async () => {
    await openSignIn(rt);
    await rt.until(() => {
      expect(rt.turnstile.mounted()).toBe(true);
    });
    await rt.turnstile.solve();
    await enterCredentials(rt, { username: '  test@example.com ', password: 'hunter2' });

    await rt.fireEvent(rt.screen.getByPlaceholderText('Password'), 'submitEditing');
    await expectSignedIn(rt);
    expect(rt.defined(loginRequests(rt)[0]).body?.['username']).toBe('test@example.com');
  });

  it('does not submit with an empty username or password', async () => {
    await openSignIn(rt);
    await rt.until(() => {
      expect(rt.turnstile.mounted()).toBe(true);
    });
    await rt.turnstile.solve();

    await rt.fireEvent.changeText(rt.screen.getByPlaceholderText('Username or email'), '   ');
    await rt.fireEvent(rt.screen.getByPlaceholderText('Password'), 'submitEditing');
    await rt.fireEvent.press(signInButton(rt));

    await rt.advanceTime(500);
    expect(loginRequests(rt)).toHaveLength(0);
  });

  it('toggles password visibility', async () => {
    await openSignIn(rt);
    const password = rt.screen.getByPlaceholderText('Password');
    expect(password.props['secureTextEntry'] as unknown).toBe(true);

    await rt.fireEvent.press(rt.screen.getByText('Show'));
    expect(rt.screen.getByPlaceholderText('Password').props['secureTextEntry'] as unknown).toBe(
      false,
    );

    await rt.fireEvent.press(rt.screen.getByText('Hide'));
    expect(rt.screen.getByPlaceholderText('Password').props['secureTextEntry'] as unknown).toBe(
      true,
    );
  });

  it('signs in without a captcha token when Floatplane does not require one', async () => {
    rt.api.captchaEnabled = false;
    await openSignIn(rt);
    await rt.until(() => {
      expect(rt.screen.getByText('Captcha not required.')).toBeTruthy();
    });
    expect(rt.turnstile.mounted()).toBe(false);

    await enterCredentials(rt);
    await rt.fireEvent.press(signInButton(rt));

    await expectSignedIn(rt);
    expect(rt.defined(loginRequests(rt)[0]).body).not.toHaveProperty('captchaToken');
  });
});

describe('sign-in failures', () => {
  async function attemptSignIn(username: string, password: string) {
    await rt.until(() => {
      expect(rt.turnstile.mounted()).toBe(true);
    });
    await rt.turnstile.solve();
    await enterCredentials(rt, { username, password });
    await rt.fireEvent.press(signInButton(rt));
  }

  it('shows the API error for a wrong password, keeps the captcha, and succeeds on retry', async () => {
    await openSignIn(rt);
    await attemptSignIn('testuser', 'wrong');

    await rt.until(() => {
      expect(rt.screen.getByText('Invalid username or password.')).toBeTruthy();
    });
    // Wrong credentials are not a captcha problem — the solved widget is left alone.
    expect(rt.turnstile.mounts()).toBe(1);

    // Turnstile tokens are single-use; the next attempt needs a fresh one from the widget.
    await rt.turnstile.solve();
    await rt.fireEvent.changeText(rt.screen.getByPlaceholderText('Password'), 'hunter2');
    await rt.fireEvent.press(signInButton(rt));

    await expectSignedIn(rt);
  });

  it('resets the Turnstile widget when the server rejects the captcha token', async () => {
    await openSignIn(rt);
    await rt.until(() => {
      expect(rt.turnstile.mounted()).toBe(true);
    });
    await rt.turnstile.emit({ type: 'load' });
    await rt.turnstile.emit({ type: 'token', token: 'forged-token' });
    await enterCredentials(rt);
    await rt.fireEvent.press(signInButton(rt));

    await rt.until(() => {
      expect(rt.screen.getByText('The captcha token is invalid or expired.')).toBeTruthy();
    });
    expect(rt.turnstile.mounts()).toBe(2);
    expect(rt.screen.getByText('Loading challenge…')).toBeTruthy();
    expect(signInButton(rt)).toBeDisabled();
  });

  it('explains when the account email is not confirmed', async () => {
    rt.api.account.emailConfirmed = false;
    await openSignIn(rt);
    await attemptSignIn('testuser', 'hunter2');

    await rt.until(() => {
      expect(rt.screen.getByText(EMAIL_NOT_CONFIRMED)).toBeTruthy();
    });
  });

  it('shows a generic error and a fresh challenge when the request never reaches Floatplane', async () => {
    rt.api.failRequests('POST /api/v3/auth/login', NETWORK_ERROR);
    await openSignIn(rt);
    await attemptSignIn('testuser', 'hunter2');

    await rt.until(() => {
      expect(rt.screen.getByText('Network request failed')).toBeTruthy();
    });
    expect(rt.turnstile.mounts()).toBe(2);
  });

  it('reports a profile failure after a successful login and stays on sign-in', async () => {
    rt.api.failRequests('GET /api/v3/status', { status: 503, body: 'Service Unavailable' });
    await openSignIn(rt);
    await attemptSignIn('testuser', 'hunter2');

    await rt.until(() => {
      expect(
        rt.screen.getByText('Failed to fetch profile: 503 - Service Unavailable'),
      ).toBeTruthy();
    });
    expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy();
  });

  it('reports a profile response without a user', async () => {
    await openSignIn(rt);
    await rt.until(() => {
      expect(rt.turnstile.mounted()).toBe(true);
    });
    rt.api.failRequests('GET /api/v3/status', { status: 200, body: { selfUser: null } });
    await attemptSignIn('testuser', 'hunter2');

    await rt.until(() => {
      expect(rt.screen.getByText('No user data returned from profile')).toBeTruthy();
    });
  });
});

describe('captcha availability', () => {
  it('retries loading the captcha requirements', async () => {
    rt.api.failRequests('GET /api/v3/auth/captcha/info', {
      status: 500,
      body: { message: 'Captcha service down' },
    });
    await openSignIn(rt);

    await rt.until(() => {
      expect(rt.screen.getByText('Captcha service down')).toBeTruthy();
    });
    expect(signInButton(rt)).toBeDisabled();

    await rt.fireEvent.press(rt.screen.getByText('Retry'));
    await rt.until(() => {
      expect(rt.turnstile.mounted()).toBe(true);
    });
    expect(rt.screen.queryByText('Captcha service down')).toBeNull();
  });

  it('falls back to a generic message when captcha info fails without a reason', async () => {
    rt.api.failRequests('GET /api/v3/auth/captcha/info', NETWORK_ERROR);
    await openSignIn(rt);
    await rt.until(() => {
      expect(rt.screen.getByText('Network request failed')).toBeTruthy();
    });
  });

  it('lets the user reload a challenge that failed to render', async () => {
    await openSignIn(rt);
    await rt.until(() => {
      expect(rt.turnstile.mounted()).toBe(true);
    });

    await rt.turnstile.fail('turnstile: 300010');
    expect(rt.screen.getByText('Captcha failed to load (turnstile: 300010)')).toBeTruthy();

    await rt.fireEvent.press(rt.screen.getByText('Retry'));
    expect(rt.turnstile.mounts()).toBe(2);
    expect(rt.screen.getByText('Loading challenge…')).toBeTruthy();
  });

  it('requires solving again after the captcha token expires', async () => {
    await openSignIn(rt);
    await rt.until(() => {
      expect(rt.turnstile.mounted()).toBe(true);
    });
    await rt.turnstile.solve();
    await enterCredentials(rt);
    expect(signInButton(rt)).toBeEnabled();

    await rt.turnstile.emit({ type: 'expire' });
    expect(signInButton(rt)).toBeDisabled();
    expect(rt.screen.getByText('Complete the challenge above')).toBeTruthy();
  });
});
