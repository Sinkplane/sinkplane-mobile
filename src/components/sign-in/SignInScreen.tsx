import type { ReactElement, ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';

import bg from '@/assets/images/bg.jpg';
import { SIGN_IN_COLORS } from '@/components/sign-in/sign-in-theme';

/** The photo background with a scrim, and a keyboard-aware scroll view centering the form. */
export function SignInScreen({ children }: Readonly<{ children: ReactNode }>): ReactElement {
  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <Image source={bg} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, styles.scrim]} />
      <KeyboardAvoidingView
        style={styles.fill}
        {...(Platform.OS === 'ios' ? { behavior: 'padding' as const } : {})}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** The form's error message, announced as an alert; nothing without one. */
export function FormError({ error }: Readonly<{ error: string | null }>): ReactElement | null {
  if (error === null || error === '') {
    return null;
  }
  return (
    <Text style={styles.errorText} accessibilityRole="alert">
      {error}
    </Text>
  );
}

interface PrimaryButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled: boolean;
  /** Shows a spinner instead of the label. */
  readonly waiting: boolean;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  waiting,
}: PrimaryButtonProps): ReactElement {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: SIGN_IN_COLORS.tint },
        (pressed || disabled) && styles.buttonDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      {waiting ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.buttonText}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },
  fill: {
    flex: 1,
  },
  scrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
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
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
