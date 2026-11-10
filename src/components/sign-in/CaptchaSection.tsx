import type { ReactElement } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { SIGN_IN_COLORS } from '@/components/sign-in/sign-in-theme';
import { TurnstileWidget, type TurnstileEvent } from '@/components/turnstile-widget';

/** Whether (and with which Turnstile site key) Floatplane wants a captcha for sign-in. */
export type CaptchaState =
  | { status: 'loading' }
  | { status: 'ready'; siteKey: string }
  | { status: 'disabled' }
  | { status: 'error'; message: string };

export interface CaptchaSectionProps {
  readonly captcha: CaptchaState;
  /** The Turnstile widget failed to render (shown with a retry). */
  readonly widgetError: string | null;
  readonly widgetReady: boolean;
  readonly hasToken: boolean;
  readonly turnstileKey: number;
  readonly onTurnstileEvent: (event: TurnstileEvent) => void;
  /** Reloads the captcha requirements. */
  readonly onRetry: () => void;
  /** Remounts a widget that failed to render. */
  readonly onRetryWidget: () => void;
}

function CaptchaRetry({
  message,
  onRetry,
}: Readonly<{ message: string; onRetry: () => void }>): ReactElement {
  return (
    <View style={styles.captchaFrame}>
      <Text style={styles.captchaErrorText}>{message}</Text>
      <Pressable onPress={onRetry} hitSlop={8}>
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );
}

function challengeStatus(widgetReady: boolean, hasToken: boolean): string {
  if (!widgetReady) {
    return 'Loading challenge…';
  }
  return hasToken ? 'Captcha verified' : 'Complete the challenge above';
}

function TurnstileChallenge({
  siteKey,
  widgetError,
  widgetReady,
  hasToken,
  turnstileKey,
  onTurnstileEvent,
  onRetryWidget,
}: Omit<CaptchaSectionProps, 'captcha' | 'onRetry'> & { readonly siteKey: string }): ReactElement {
  if (widgetError !== null && widgetError !== '') {
    return (
      <CaptchaRetry message={`Captcha failed to load (${widgetError})`} onRetry={onRetryWidget} />
    );
  }
  return (
    <View style={styles.captchaFrame}>
      <TurnstileWidget
        siteKey={siteKey}
        theme="dark"
        onEvent={onTurnstileEvent}
        reloadKey={turnstileKey}
      />
      <Text style={styles.captchaStatus}>{challengeStatus(widgetReady, hasToken)}</Text>
    </View>
  );
}

/** The captcha part of the sign-in form, for every state of the captcha requirements. */
export function CaptchaSection({ captcha, onRetry, ...widget }: CaptchaSectionProps): ReactElement {
  switch (captcha.status) {
    case 'disabled':
      return (
        <Text style={styles.captchaStatus} accessibilityLabel="Captcha not required">
          Captcha not required.
        </Text>
      );
    case 'loading':
      return (
        <View style={styles.captchaFrame}>
          <ActivityIndicator size="small" color={SIGN_IN_COLORS.muted} />
          <Text style={styles.captchaStatus}>Loading captcha requirements…</Text>
        </View>
      );
    case 'error':
      return <CaptchaRetry message={captcha.message} onRetry={onRetry} />;
    case 'ready':
      return <TurnstileChallenge siteKey={captcha.siteKey} {...widget} />;
  }
}

const styles = StyleSheet.create({
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
    color: SIGN_IN_COLORS.muted,
  },
  captchaErrorText: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 6,
    color: SIGN_IN_COLORS.muted,
  },
  retryText: {
    color: '#0085FF',
    fontSize: 14,
    fontWeight: '600',
  },
});
