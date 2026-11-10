/**
 * E2E: the two-factor step of username/password sign-in, and restoring / losing a persisted session.
 */

import { NETWORK_ERROR } from './helpers/mock-floatplane-api';
import { loadRuntime, type Runtime } from './helpers/runtime';
import { expectSignedIn, loginRequests, submitDefaultSignIn } from './helpers/sign-in-flows';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

describe('two-factor authentication', () => {
  beforeEach(() => {
    rt.api.account.twoFactorCode = '123456';
  });

  async function reachTwoFactor() {
    await submitDefaultSignIn(rt);
    await rt.until(() => {
      expect(rt.screen.getByText('Two-factor authentication')).toBeTruthy();
    });
  }

  const codeInput = () => rt.screen.getByPlaceholderText('123456');
  const twoFactorRequests = () => rt.api.requestsTo('/api/v3/auth/checkFor2faLogin', 'POST');

  it('asks for a code after the password step and signs in with it', async () => {
    await reachTwoFactor();

    await rt.fireEvent.changeText(codeInput(), '123 456');
    await rt.fireEvent.press(rt.screen.getByText('Verify'));

    await expectSignedIn(rt);
    const check = rt.defined(twoFactorRequests()[0]);
    expect(check.body).toEqual({ token: '123456' });
    // The pending login token becomes the session.
    expect(check.bearer).toBe(JSON.parse(rt.secureStore.get('fptoken') ?? 'null'));
  });

  it('shows an error for a wrong code and accepts the right one afterwards', async () => {
    await reachTwoFactor();

    await rt.fireEvent.changeText(codeInput(), '000000');
    await rt.fireEvent(codeInput(), 'submitEditing');
    await rt.until(() => {
      expect(rt.screen.getByText('The two-factor code is incorrect.')).toBeTruthy();
    });

    await rt.fireEvent.changeText(codeInput(), '123456');
    await rt.fireEvent(codeInput(), 'submitEditing');
    await expectSignedIn(rt);
  });

  it('accepts a backup code', async () => {
    rt.api.account.twoFactorCode = 'abc123-def456';
    await reachTwoFactor();

    await rt.fireEvent.changeText(codeInput(), 'abc123-def456');
    await rt.fireEvent.press(rt.screen.getByText('Verify'));
    await expectSignedIn(rt);
    expect(rt.defined(twoFactorRequests()[0]).body).toEqual({ token: 'abc123-def456' });
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
    rt.api.failRequests('POST /api/v3/auth/checkFor2faLogin', NETWORK_ERROR);

    await rt.fireEvent.changeText(codeInput(), '123456');
    await rt.fireEvent.press(rt.screen.getByText('Verify'));
    await rt.until(() => {
      expect(rt.screen.getByText('Network request failed')).toBeTruthy();
    });
  });

  it('goes back to the credentials step', async () => {
    await reachTwoFactor();

    await rt.fireEvent.press(rt.screen.getByText('Back to sign in'));

    expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy();
    expect(rt.screen.getByPlaceholderText('Username or email').props['value'] as unknown).toBe(
      'testuser',
    );
  });

  it('asks for 2FA even when the login response carries no token', async () => {
    rt.api.failRequests('POST /api/v3/auth/login', { status: 200, body: { needs2FA: false } });
    await submitDefaultSignIn(rt);

    await rt.until(() => {
      expect(rt.screen.getByText('Two-factor authentication')).toBeTruthy();
    });
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
    await expectSignedIn(rt);
    expect(loginRequests(rt)).toHaveLength(0);
  });

  it('returns to sign-in when the saved session has been revoked', async () => {
    rt.seedSession({ token: 'revoked-token' });
    await rt.renderApp();

    await rt.until(() => {
      expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy();
    });
    expect(rt.secureStore.has('fptoken')).toBe(false);
  });
});
