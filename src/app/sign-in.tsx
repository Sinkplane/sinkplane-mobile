import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';

import bg from '@/assets/images/bg.jpg';
import { TurnstileWidget, type TurnstileEvent } from '@/components/turnstile-widget';
import {
  Colors,
  FloatplaneApiError,
  checkFor2faLogin,
  fetchProfile,
  getCaptchaInfo,
  loginWithPassword,
  useSession,
  type LoginResponse,
} from '@/shared';

type CaptchaState =
  { status: 'loading' } | { status: 'ready'; siteKey: string } | { status: 'disabled' } | { status: 'error'; message: string };

const EMAIL_NOT_CONFIRMED = 'Your email address has not been confirmed yet. Check your inbox for the confirmation email before signing in.';

// The sign-in screen sits on a photo background, so it uses a fixed light-on-dark
// palette regardless of the app theme (same treatment as the TV sign-in screen).
const textColor = '#fff';
const mutedColor = 'rgba(255, 255, 255, 0.8)';
const tintColor = Colors.light.tint;
const inputBackground = 'rgba(0, 0, 0, 0.45)';
const scheme = 'dark' as const;

// 6-digit code or backup code (xxxxxx-xxxxxx) — same validation as the web client.
const VALID_2FA = /(^[0-9]{6}$)|(^[a-z0-9]{6}-?[a-z0-9]{6}$)/i;

export default function SignIn() {
  const { signIn } = useSession();

  const [step, setStep] = useState<'credentials' | 'twofactor'>('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [captcha, setCaptcha] = useState<CaptchaState>({ status: 'loading' });
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadCaptcha = useCallback(async () => {
    setCaptcha({ status: 'loading' });
    setCaptchaToken(null);
    try {
      const info = await getCaptchaInfo();
      const siteKey = info.turnstile?.variants?.managed?.siteKey;
      console.info('[SignIn] captcha info:', siteKey ? `siteKey ${siteKey}` : 'not required');
      setCaptcha(siteKey ? { status: 'ready', siteKey } : { status: 'disabled' });
    } catch (err) {
      console.error('[SignIn] captcha info failed:', err);
      setCaptcha({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load captcha' });
    }
  }, []);

  useEffect(() => {
    loadCaptcha();
  }, [loadCaptcha]);

  const resetCaptcha = useCallback(() => {
    setCaptchaToken(null);
    setWidgetError(null);
    setWidgetReady(false);
    setTurnstileKey(k => k + 1);
  }, []);

  const handleTurnstileEvent = useCallback((event: TurnstileEvent) => {
    const detail = 'error' in event ? event.error : 'token' in event ? `len=${event.token.length}` : '';
    console.info('[Turnstile] event:', event.type, detail);
    if (event.type === 'token') {
      setCaptchaToken(event.token);
      setWidgetError(null);
    } else if (event.type === 'load') {
      setWidgetReady(true);
      setWidgetError(null);
    } else if (event.type === 'error') {
      console.error('[Turnstile] widget error:', event.error);
      setCaptchaToken(null);
      setWidgetError(event.error);
    } else {
      // Token expired; managed widgets auto-refresh and re-issue a token.
      setCaptchaToken(null);
    }
  }, []);

  const finishLogin = useCallback(
    async (token: string) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const profile = await fetchProfile(token);
        const user = profile.selfUser;
        if (!user) {
          throw new Error('No user data returned from profile');
        }
        await signIn({ token, user });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load your profile');
      } finally {
        setIsSubmitting(false);
      }
    },
    [signIn],
  );

  const handleLoginResponse = useCallback(
    async (response: LoginResponse) => {
      if (response.needs2FA || !response.token) {
        setPendingToken(response.token ?? null);
        setTwoFactorCode('');
        setStep('twofactor');
        return;
      }
      await finishLogin(response.token);
    },
    [finishLogin],
  );

  const submitCredentials = useCallback(async () => {
    if (!username.trim() || !password || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await loginWithPassword(username, password, captchaToken ?? undefined);
      await handleLoginResponse(response);
    } catch (err) {
      if (err instanceof FloatplaneApiError) {
        setError(err.errorName === 'emailNotConfirmedError' ? EMAIL_NOT_CONFIRMED : err.message);
        if (err.errorName === 'invalidCaptchaTokenError') resetCaptcha();
      } else {
        setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
        resetCaptcha();
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [username, password, captchaToken, isSubmitting, handleLoginResponse, resetCaptcha]);

  const submitTwoFactor = useCallback(async () => {
    const code = twoFactorCode.replace(/\s/g, '');
    if (!pendingToken || !VALID_2FA.test(code) || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await checkFor2faLogin(pendingToken, code);
      await finishLogin(pendingToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [twoFactorCode, pendingToken, isSubmitting, finishLogin]);

  // A fresh captcha token is required for every attempt while one is enforced.
  const captchaBlocksSubmit = captcha.status === 'loading' || captcha.status === 'error' || (captcha.status === 'ready' && !captchaToken);

  if (step === 'twofactor') {
    return (
      <Screen>
        <TwoFactorForm
          code={twoFactorCode}
          onCodeChange={setTwoFactorCode}
          onSubmit={submitTwoFactor}
          onBack={() => {
            setStep('credentials');
            setError(null);
          }}
          isSubmitting={isSubmitting}
          error={error}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <CredentialsForm
        username={username}
        password={password}
        onUsernameChange={setUsername}
        onPasswordChange={setPassword}
        onSubmit={submitCredentials}
        isSubmitting={isSubmitting}
        captchaBlocksSubmit={captchaBlocksSubmit}
        captcha={captcha}
        widgetError={widgetError}
        widgetReady={widgetReady}
        hasToken={!!captchaToken}
        turnstileKey={turnstileKey}
        onTurnstileEvent={handleTurnstileEvent}
        onRetryCaptcha={loadCaptcha}
        onRetryWidget={resetCaptcha}
        error={error}
      />
    </Screen>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <Image source={bg} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, styles.scrim]} />
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function CredentialsForm({
  username,
  password,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
  isSubmitting,
  captchaBlocksSubmit,
  captcha,
  widgetError,
  widgetReady,
  hasToken,
  turnstileKey,
  onTurnstileEvent,
  onRetryCaptcha,
  onRetryWidget,
  error,
}: {
  username: string;
  password: string;
  onUsernameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  captchaBlocksSubmit: boolean;
  captcha: CaptchaState;
  widgetError: string | null;
  widgetReady: boolean;
  hasToken: boolean;
  turnstileKey: number;
  onTurnstileEvent: (event: TurnstileEvent) => void;
  onRetryCaptcha: () => void;
  onRetryWidget: () => void;
  error: string | null;
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <View style={styles.card}>
      <Text style={[styles.header, { color: textColor }]}>Sign in to Floatplane</Text>
      <Text style={[styles.description, { color: mutedColor }]}>Use your Floatplane username or email and password.</Text>

      <TextInput
        style={[styles.input, { color: textColor, backgroundColor: inputBackground }]}
        placeholder="Username or email"
        placeholderTextColor={mutedColor}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={username}
        onChangeText={onUsernameChange}
        editable={!isSubmitting}
      />
      <View style={styles.passwordRow}>
        <TextInput
          style={[styles.input, styles.passwordInput, { color: textColor, backgroundColor: inputBackground }]}
          placeholder="Password"
          placeholderTextColor={mutedColor}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={!showPassword}
          value={password}
          onChangeText={onPasswordChange}
          onSubmitEditing={onSubmit}
          editable={!isSubmitting}
        />
        <Pressable style={styles.passwordToggle} onPress={() => setShowPassword(s => !s)} hitSlop={8}>
          <Text style={[styles.passwordToggleText, { color: tintColor }]}>{showPassword ? 'Hide' : 'Show'}</Text>
        </Pressable>
      </View>

      <CaptchaSection
        captcha={captcha}
        widgetError={widgetError}
        widgetReady={widgetReady}
        hasToken={hasToken}
        turnstileKey={turnstileKey}
        onTurnstileEvent={onTurnstileEvent}
        onRetry={onRetryCaptcha}
        onRetryWidget={onRetryWidget}
      />

      {error ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <PrimaryButton label="Sign In" onPress={onSubmit} disabled={isSubmitting || captchaBlocksSubmit} waiting={isSubmitting} />
    </View>
  );
}

function CaptchaSection({
  captcha,
  widgetError,
  widgetReady,
  hasToken,
  turnstileKey,
  onTurnstileEvent,
  onRetry,
  onRetryWidget,
}: {
  captcha: CaptchaState;
  widgetError: string | null;
  widgetReady: boolean;
  hasToken: boolean;
  turnstileKey: number;
  onTurnstileEvent: (event: TurnstileEvent) => void;
  onRetry: () => void;
  onRetryWidget: () => void;
}) {
  if (captcha.status === 'disabled') {
    return (
      <Text style={[styles.captchaStatus, { color: mutedColor }]} accessibilityLabel="Captcha not required">
        Captcha not required.
      </Text>
    );
  }

  if (captcha.status === 'loading') {
    return (
      <View style={styles.captchaFrame}>
        <ActivityIndicator size="small" color={mutedColor} />
        <Text style={[styles.captchaStatus, { color: mutedColor }]}>Loading captcha requirements…</Text>
      </View>
    );
  }

  if (captcha.status === 'error') {
    return (
      <View style={styles.captchaFrame}>
        <Text style={[styles.captchaErrorText, { color: mutedColor }]}>{captcha.message}</Text>
        <Pressable onPress={onRetry} hitSlop={8}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (widgetError) {
    return (
      <View style={styles.captchaFrame}>
        <Text style={[styles.captchaErrorText, { color: mutedColor }]}>Captcha failed to load ({widgetError})</Text>
        <Pressable onPress={onRetryWidget} hitSlop={8}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const statusText = !widgetReady ? 'Loading challenge…' : hasToken ? 'Captcha verified' : 'Complete the challenge above';

  return (
    <View style={styles.captchaFrame}>
      <TurnstileWidget siteKey={captcha.siteKey} theme={scheme} onEvent={onTurnstileEvent} reloadKey={turnstileKey} />
      <Text style={[styles.captchaStatus, { color: mutedColor }]}>{statusText}</Text>
    </View>
  );
}

function TwoFactorForm({
  code,
  onCodeChange,
  onSubmit,
  onBack,
  isSubmitting,
  error,
}: {
  code: string;
  onCodeChange: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  return (
    <View style={styles.card}>
      <Text style={[styles.header, { color: textColor }]}>Two-factor authentication</Text>
      <Text style={[styles.description, { color: mutedColor }]}>Enter the 6-digit code from your authenticator app, or a backup code.</Text>

      <TextInput
        style={[styles.input, styles.codeInput, { color: textColor, backgroundColor: inputBackground }]}
        placeholder="123456"
        placeholderTextColor={mutedColor}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        value={code}
        onChangeText={onCodeChange}
        onSubmitEditing={onSubmit}
        editable={!isSubmitting}
      />

      {error ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <PrimaryButton label="Verify" onPress={onSubmit} disabled={isSubmitting} waiting={isSubmitting} />

      <Pressable style={styles.backButton} onPress={onBack} disabled={isSubmitting} hitSlop={8}>
        <Text style={[styles.backButtonText, { color: mutedColor }]}>Back to sign in</Text>
      </Pressable>
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled, waiting }: { label: string; onPress: () => void; disabled: boolean; waiting: boolean }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.button, { backgroundColor: tintColor }, (pressed || disabled) && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      {waiting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    padding: 24,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  header: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  description: {
    fontSize: 15,
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    marginBottom: 0,
  },
  passwordToggle: {
    position: 'absolute',
    right: 12,
    padding: 6,
  },
  passwordToggleText: {
    fontSize: 14,
    fontWeight: '600',
  },
  captchaFrame: {
    minHeight: 70,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginVertical: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  captchaStatus: {
    fontSize: 12,
    textAlign: 'center',
  },
  captchaErrorText: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 6,
  },
  retryText: {
    color: '#0085FF',
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  codeInput: {
    fontSize: 22,
    letterSpacing: 3,
    textAlign: 'center',
  },
  backButton: {
    marginTop: 18,
    alignSelf: 'center',
  },
  backButtonText: {
    fontSize: 15,
  },
});
