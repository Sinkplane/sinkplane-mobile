import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { useGetProfile, useOIDCDeviceFlow, useSession, useThemeColor, type OIDCStatus } from '@/shared';

function getStatusText(status: OIDCStatus, errorMessage: string | null) {
  switch (status) {
    case 'idle':
    case 'requesting':
      return 'Requesting login code...';
    case 'polling':
      return 'Waiting for you to approve the login...';
    case 'success':
      return 'Login successful! Loading your profile...';
    case 'expired':
      return errorMessage || 'Login code expired. Refreshing...';
    case 'error':
      return errorMessage || 'An error occurred. Please try again.';
    default:
      return '';
  }
}

export default function SignIn() {
  const { signIn } = useSession();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const { status, startFlow, cancel, userCode, verificationUri, verificationUriComplete, expiresAt, errorMessage, tokenResponse } =
    useOIDCDeviceFlow();
  const [timeRemaining, setTimeRemaining] = useState('');

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const tintColor = useThemeColor({}, 'tint');

  const { refetch: refetchProfile } = useGetProfile(tokenResponse?.accessToken ?? undefined);

  // Auto-start the OIDC device flow on mount
  useEffect(() => {
    startFlow();
    return () => {
      cancel();
    };
  }, [startFlow, cancel]);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt || status !== 'polling') {
      setTimeRemaining('');
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, expiresAt - Date.now());
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, status]);

  // Open the verification link in the system browser
  const openVerificationLink = useCallback(async () => {
    const url = verificationUriComplete ?? verificationUri;
    if (!url) return;
    await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
  }, [verificationUri, verificationUriComplete]);

  // Handle OIDC success - fetch profile and sign in
  useEffect(() => {
    if (status !== 'success' || !tokenResponse || isLoggingIn) return;

    const handleLogin = async () => {
      setIsLoggingIn(true);
      try {
        const profileResult = await refetchProfile();

        if (profileResult.error) {
          throw new Error('Failed to fetch profile with the provided token');
        }

        if (!profileResult.data?.selfUser) {
          throw new Error('No user data returned from profile');
        }

        const tokenExpiration = new Date(Date.now() + tokenResponse.expiresIn * 1000).toISOString();

        signIn({
          token: tokenResponse.accessToken,
          user: profileResult.data.selfUser,
          tokenExpiration,
          refreshToken: tokenResponse.refreshToken,
        });
      } catch (error) {
        console.error('[SignIn] Login failed:', error);
      } finally {
        setIsLoggingIn(false);
      }
    };

    handleLogin();
  }, [status, tokenResponse, isLoggingIn, refetchProfile, signIn]);

  // Auto-restart on expiration
  useEffect(() => {
    if (status === 'expired') {
      const timer = setTimeout(() => {
        startFlow();
      }, 2000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [status, startFlow]);

  const getStatusMessage = () => getStatusText(status, errorMessage);

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <View style={styles.content}>
        <Text style={[styles.header, { color: textColor }]}>Sign in to Floatplane</Text>
        <Text style={[styles.description, { color: mutedColor }]}>
          Approve the login in your browser to link this device to your account.
        </Text>

        {/* User Code Display */}
        <DeviceCodeCard
          status={status}
          userCode={userCode}
          textColor={textColor}
          mutedColor={mutedColor}
          tintColor={tintColor}
        />

        {/* Timer */}
        {timeRemaining ? <Text style={[styles.timer, { color: mutedColor }]}>Expires in {timeRemaining}</Text> : null}

        {/* Status */}
        <Text style={[styles.statusText, { color: mutedColor }]}>{getStatusMessage()}</Text>

        <SignInActions
          status={status}
          textColor={textColor}
          mutedColor={mutedColor}
          tintColor={tintColor}
          hasLink={!!(verificationUriComplete || verificationUri)}
          onOpenLink={openVerificationLink}
          onRetry={startFlow}
          onNewCode={() => {
            cancel();
            startFlow();
          }}
        />
      </View>
    </View>
  );
}

function DeviceCodeCard({
  status,
  userCode,
  textColor,
  mutedColor,
  tintColor,
}: {
  status: OIDCStatus;
  userCode: string | null;
  textColor: string;
  mutedColor: string;
  tintColor: string;
}) {
  if (userCode && status === 'polling') {
    return (
      <View style={[styles.userCodeContainer, { borderColor: `${mutedColor}33` }]}>
        <Text style={[styles.userCodeLabel, { color: mutedColor }]}>Your code</Text>
        <Text style={[styles.userCode, { color: textColor }]}>{userCode}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.userCodePlaceholder, { borderColor: `${mutedColor}22` }]}>
      {status === 'requesting' || status === 'idle' ? <ActivityIndicator color={tintColor} /> : (
        <Text style={[styles.placeholderText, { color: mutedColor }]}>No code</Text>
      )}
    </View>
  );
}

function SignInActions({
  status,
  textColor,
  mutedColor,
  tintColor,
  hasLink,
  onOpenLink,
  onRetry,
  onNewCode,
}: {
  status: OIDCStatus;
  textColor: string;
  mutedColor: string;
  tintColor: string;
  hasLink: boolean;
  onOpenLink: () => void;
  onRetry: () => void;
  onNewCode: () => void;
}) {
  return (
    <>
      {/* Primary action during polling: open the link */}
      {status === 'polling' && hasLink ? (
        <Pressable
          style={({ pressed }) => [styles.button, { backgroundColor: tintColor }, pressed && styles.buttonPressed]}
          onPress={onOpenLink}
        >
          <Text style={styles.buttonText}>Open floatplane.com/link</Text>
        </Pressable>
      ) : null}

      {/* Retry Button */}
      {(status === 'error' || status === 'expired') && (
        <Pressable
          style={({ pressed }) => [styles.button, { backgroundColor: tintColor }, pressed && styles.buttonPressed]}
          onPress={onRetry}
        >
          <Text style={styles.buttonText}>Try Again</Text>
        </Pressable>
      )}

      {/* New Code during polling */}
      {status === 'polling' && (
        <Pressable
          style={({ pressed }) => [
            styles.cancelButton,
            { borderColor: `${mutedColor}66` },
            pressed && styles.cancelButtonPressed,
          ]}
          onPress={onNewCode}
        >
          <Text style={[styles.cancelButtonText, { color: textColor }]}>Get New Code</Text>
        </Pressable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 480,
    alignItems: 'center',
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    marginBottom: 32,
    textAlign: 'center',
  },
  userCodeContainer: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 32,
    paddingVertical: 20,
    marginBottom: 12,
    minWidth: 240,
  },
  userCodeLabel: {
    fontSize: 14,
    marginBottom: 6,
  },
  userCode: {
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: 4,
  },
  userCodePlaceholder: {
    width: 240,
    height: 96,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  placeholderText: {
    fontSize: 16,
  },
  timer: {
    fontSize: 14,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 32,
    minHeight: 20,
  },
  button: {
    width: '100%',
    maxWidth: 400,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'transparent',
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonPressed: {
    opacity: 0.7,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
