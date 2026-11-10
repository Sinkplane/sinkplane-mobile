/**
 * Sign-in screen steps shared by the auth E2E suites (auth*.e2e.test.tsx). Each takes the test's
 * runtime (`loadRuntime()`).
 */

import type { Runtime } from './runtime';
import type { RecordedRequest } from './mock-floatplane-api';
import type { TestInstance } from './test-utils';

export const signInButton = (rt: Runtime): TestInstance => rt.screen.getByText('Sign In');

export const loginRequests = (rt: Runtime): RecordedRequest[] =>
  rt.api.requestsTo('/api/v3/auth/login', 'POST');

export async function openSignIn(rt: Runtime): Promise<void> {
  await rt.renderApp();
  await rt.until(() => {
    expect(rt.screen.getByText('Sign in to Floatplane')).toBeTruthy();
  });
}

export async function enterCredentials(
  rt: Runtime,
  { username = 'testuser', password = 'hunter2' } = {},
): Promise<void> {
  await rt.fireEvent.changeText(rt.screen.getByPlaceholderText('Username or email'), username);
  await rt.fireEvent.changeText(rt.screen.getByPlaceholderText('Password'), password);
}

/** Open sign-in, pass the challenge, enter the default credentials and press Sign In. */
export async function submitDefaultSignIn(rt: Runtime): Promise<void> {
  await openSignIn(rt);
  await rt.until(() => {
    expect(rt.turnstile.mounted()).toBe(true);
  });
  await rt.turnstile.solve();
  await enterCredentials(rt);
  await rt.fireEvent.press(signInButton(rt));
}

export async function expectSignedIn(rt: Runtime): Promise<void> {
  await rt.until(() => {
    expect(rt.inTab('index').getByText('Main Channel Video 01')).toBeTruthy();
  });
  expect(rt.selectedTab()).toBe('index');
  expect(rt.screen.queryByText('Sign in to Floatplane')).toBeNull();
}
