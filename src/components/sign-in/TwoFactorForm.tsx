import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { FormError, PrimaryButton } from '@/components/sign-in/SignInScreen';
import { formStyles, SIGN_IN_COLORS } from '@/components/sign-in/sign-in-theme';

export interface TwoFactorFormProps {
  readonly code: string;
  readonly onCodeChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onBack: () => void;
  readonly isSubmitting: boolean;
  readonly error: string | null;
}

/** The second sign-in step: an authenticator or backup code. */
export function TwoFactorForm({
  code,
  onCodeChange,
  onSubmit,
  onBack,
  isSubmitting,
  error,
}: TwoFactorFormProps): ReactElement {
  return (
    <View style={formStyles.card}>
      <Text style={formStyles.header}>Two-factor authentication</Text>
      <Text style={formStyles.description}>
        Enter the 6-digit code from your authenticator app, or a backup code.
      </Text>
      <TextInput
        style={[formStyles.input, styles.codeInput]}
        placeholder="123456"
        placeholderTextColor={SIGN_IN_COLORS.muted}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        value={code}
        onChangeText={onCodeChange}
        onSubmitEditing={onSubmit}
        editable={!isSubmitting}
      />
      <FormError error={error} />
      <PrimaryButton
        label="Verify"
        onPress={onSubmit}
        disabled={isSubmitting}
        waiting={isSubmitting}
      />
      <Pressable style={styles.backButton} onPress={onBack} disabled={isSubmitting} hitSlop={8}>
        <Text style={styles.backButtonText}>Back to sign in</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
    color: SIGN_IN_COLORS.muted,
  },
});
