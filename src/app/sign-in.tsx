import { useCallback, useEffect, useState, type ReactElement } from 'react';

import type { CaptchaSectionProps, CaptchaState } from '@/components/sign-in/CaptchaSection';
import { CredentialsForm } from '@/components/sign-in/CredentialsForm';
import { logSignIn } from '@/components/sign-in/diagnostics';
import { SignInScreen } from '@/components/sign-in/SignInScreen';
import { applyTurnstileEvent } from '@/components/sign-in/turnstile-events';
import { TwoFactorForm } from '@/components/sign-in/TwoFactorForm';
import type { TurnstileEvent } from '@/components/turnstile-widget';
import {
  FloatplaneApiError,
  checkFor2faLogin,
  fetchProfile,
  getCaptchaInfo,
  loginWithPassword,
  useSession,
  type LoginResponse,
  type User,
} from '@/shared';

const EMAIL_NOT_CONFIRMED =
  'Your email address has not been confirmed yet. Check your inbox for the confirmation email before signing in.';

// 6-digit code or backup code (xxxxxx-xxxxxx) — same validation as the web client.
const VALID_2FA = /(^\d{6}$)|(^[a-z0-9]{6}-?[a-z0-9]{6}$)/i;

/** The shared SessionProvider's `signIn` is async at runtime (it loads subscriptions), though typed void. */
type SignInAsync = (
  params: Parameters<ReturnType<typeof useSession>['signIn']>[0],
) => Promise<void> | void;

type CaptchaInfo = Awaited<ReturnType<typeof getCaptchaInfo>>;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function managedSiteKey(info: CaptchaInfo): string | undefined {
  return info.turnstile?.variants?.managed?.siteKey;
}

/** Floatplane's captcha requirements for sign-in: a Turnstile site key, or none. */
async function requestCaptcha(): Promise<CaptchaState> {
  try {
    const siteKey = managedSiteKey(await getCaptchaInfo());
    const required = siteKey !== undefined && siteKey !== '';
    logSignIn('info', '[SignIn] captcha info:', required ? `siteKey ${siteKey}` : 'not required');
    return required ? { status: 'ready', siteKey } : { status: 'disabled' };
  } catch (err) {
    logSignIn('error', '[SignIn] captcha info failed:', err);
    return { status: 'error', message: errorMessage(err, 'Failed to load captcha') };
  }
}

/** The Turnstile widget's state: the latest token, whether it rendered, and its render error. */
function useTurnstile() {
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [turnstileKey, setTurnstileKey] = useState(0);

  const resetCaptcha = useCallback(() => {
    setCaptchaToken(null);
    setWidgetError(null);
    setWidgetReady(false);
    setTurnstileKey((k) => k + 1);
  }, []);

  const handleTurnstileEvent = useCallback((event: TurnstileEvent) => {
    applyTurnstileEvent(event, { setCaptchaToken, setWidgetError, setWidgetReady });
  }, []);

  return {
    captchaToken,
    setCaptchaToken,
    widgetError,
    widgetReady,
    turnstileKey,
    resetCaptcha,
    handleTurnstileEvent,
  };
}

/** A fresh captcha token is required for every attempt while one is enforced. */
function captchaBlocks(captcha: CaptchaState, captchaToken: string | null): boolean {
  if (captcha.status === 'loading' || captcha.status === 'error') {
    return true;
  }
  return captcha.status === 'ready' && captchaToken === null;
}

/** The captcha requirements (loaded on mount, reloadable) plus the Turnstile widget state. */
function useCaptcha() {
  const [captcha, setCaptcha] = useState<CaptchaState>({ status: 'loading' });
  const turnstile = useTurnstile();
  const { setCaptchaToken } = turnstile;

  useEffect(() => {
    void requestCaptcha().then(setCaptcha);
  }, []);

  const loadCaptcha = useCallback(() => {
    setCaptcha({ status: 'loading' });
    setCaptchaToken(null);
    void requestCaptcha().then(setCaptcha);
  }, [setCaptchaToken]);

  return {
    ...turnstile,
    captcha,
    loadCaptcha,
    blocksSubmit: captchaBlocks(captcha, turnstile.captchaToken),
  };
}

/** The profile's user; a response without one can't sign in. */
function selfUserOf(profile: { readonly selfUser?: User | null }): User {
  if (!profile.selfUser) {
    throw new Error('No user data returned from profile');
  }
  return profile.selfUser;
}

function credentialsError(err: unknown): string {
  if (err instanceof FloatplaneApiError) {
    return err.errorName === 'emailNotConfirmedError' ? EMAIL_NOT_CONFIRMED : err.message;
  }
  return errorMessage(err, 'Sign-in failed. Please try again.');
}

/** Turnstile tokens are single-use: get a fresh one unless the server rejected something else. */
function needsFreshCaptcha(err: unknown): boolean {
  return !(err instanceof FloatplaneApiError) || err.errorName === 'invalidCaptchaTokenError';
}

function hasText(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value !== '';
}

/** Submission state shared by both steps. */
function useSubmission() {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /** Runs one submission: clears the error, flags it in progress, and reports what it throws. */
  const submit = useCallback(
    async (run: () => Promise<void>, onError: (err: unknown) => string) => {
      setIsSubmitting(true);
      setError(null);
      try {
        await run();
      } catch (err) {
        setError(onError(err));
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  return { error, setError, isSubmitting, submit };
}

/** Loads the profile for a usable session token and signs in with it. */
function useFinishLogin(submission: ReturnType<typeof useSubmission>) {
  const { signIn } = useSession();
  const { submit } = submission;
  return useCallback(
    (token: string) =>
      submit(
        async () => {
          const user = selfUserOf(await fetchProfile(token));
          const signInAsync: SignInAsync = signIn;
          await signInAsync({ token, user });
        },
        (err) => errorMessage(err, 'Failed to load your profile'),
      ),
    [signIn, submit],
  );
}

/** The 2FA step: the pending session token, the code, and its submission. */
function useTwoFactor(
  submission: ReturnType<typeof useSubmission>,
  finishLogin: (token: string) => Promise<void>,
) {
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const { isSubmitting, submit } = submission;

  const submitTwoFactor = useCallback(() => {
    const code = twoFactorCode.replace(/\s/g, '');
    if (!hasText(pendingToken) || !VALID_2FA.test(code) || isSubmitting) {
      return;
    }
    void submit(
      async () => {
        await checkFor2faLogin(pendingToken, code);
        await finishLogin(pendingToken);
      },
      (err) => errorMessage(err, 'Verification failed. Please try again.'),
    );
  }, [twoFactorCode, pendingToken, isSubmitting, submit, finishLogin]);

  const begin = useCallback((token: string | undefined) => {
    setPendingToken(token ?? null);
    setTwoFactorCode('');
  }, []);

  return { twoFactorCode, setTwoFactorCode, submitTwoFactor, begin };
}

function canSubmitCredentials(username: string, password: string, isSubmitting: boolean): boolean {
  return username.trim() !== '' && password !== '' && !isSubmitting;
}

/** The credentials step: username, password, and their submission (with the captcha token). */
function useCredentialsStep(
  submission: ReturnType<typeof useSubmission>,
  captcha: ReturnType<typeof useCaptcha>,
  handleLoginResponse: (response: LoginResponse) => Promise<void>,
) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { isSubmitting, submit } = submission;
  const { captchaToken, resetCaptcha } = captcha;

  const submitCredentials = useCallback(() => {
    if (!canSubmitCredentials(username, password, isSubmitting)) {
      return;
    }
    void submit(
      async () => {
        await handleLoginResponse(
          await loginWithPassword(username, password, captchaToken ?? undefined),
        );
      },
      (err) => {
        if (needsFreshCaptcha(err)) {
          resetCaptcha();
        }
        return credentialsError(err);
      },
    );
  }, [username, password, captchaToken, isSubmitting, submit, handleLoginResponse, resetCaptcha]);

  return { username, setUsername, password, setPassword, submitCredentials };
}

/** The whole sign-in flow: credentials (+ captcha), then a 2FA code when the account needs one. */
function useSignInFlow() {
  const [step, setStep] = useState<'credentials' | 'twofactor'>('credentials');
  const captcha = useCaptcha();
  const submission = useSubmission();
  const finishLogin = useFinishLogin(submission);
  const twoFactor = useTwoFactor(submission, finishLogin);
  const { begin: beginTwoFactor } = twoFactor;
  const { setError } = submission;

  const handleLoginResponse = useCallback(
    async (response: LoginResponse) => {
      if (response.needs2FA || !hasText(response.token)) {
        beginTwoFactor(response.token);
        setStep('twofactor');
        return;
      }
      await finishLogin(response.token);
    },
    [finishLogin, beginTwoFactor],
  );
  const credentials = useCredentialsStep(submission, captcha, handleLoginResponse);

  const backToCredentials = useCallback(() => {
    setStep('credentials');
    setError(null);
  }, [setError]);

  return { step, credentials, captcha, submission, twoFactor, backToCredentials };
}

/** The captcha section's props from the captcha state. */
function captchaSectionProps(captcha: ReturnType<typeof useCaptcha>): CaptchaSectionProps {
  return {
    captcha: captcha.captcha,
    widgetError: captcha.widgetError,
    widgetReady: captcha.widgetReady,
    hasToken: captcha.captchaToken !== null,
    turnstileKey: captcha.turnstileKey,
    onTurnstileEvent: captcha.handleTurnstileEvent,
    onRetry: captcha.loadCaptcha,
    onRetryWidget: captcha.resetCaptcha,
  };
}

export default function SignIn(): ReactElement {
  const { step, credentials, captcha, submission, twoFactor, backToCredentials } = useSignInFlow();

  if (step === 'twofactor') {
    return (
      <SignInScreen>
        <TwoFactorForm
          code={twoFactor.twoFactorCode}
          onCodeChange={twoFactor.setTwoFactorCode}
          onSubmit={twoFactor.submitTwoFactor}
          onBack={backToCredentials}
          isSubmitting={submission.isSubmitting}
          error={submission.error}
        />
      </SignInScreen>
    );
  }

  return (
    <SignInScreen>
      <CredentialsForm
        username={credentials.username}
        password={credentials.password}
        onUsernameChange={credentials.setUsername}
        onPasswordChange={credentials.setPassword}
        onSubmit={credentials.submitCredentials}
        isSubmitting={submission.isSubmitting}
        captchaBlocksSubmit={captcha.blocksSubmit}
        captcha={captchaSectionProps(captcha)}
        error={submission.error}
      />
    </SignInScreen>
  );
}
