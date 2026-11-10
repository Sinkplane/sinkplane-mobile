import { useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CaptchaSection, type CaptchaSectionProps } from '@/components/sign-in/CaptchaSection';
import { FormError, PrimaryButton } from '@/components/sign-in/SignInScreen';
import { formStyles, SIGN_IN_COLORS } from '@/components/sign-in/sign-in-theme';

export interface CredentialsFormProps {
  readonly username: string;
  readonly password: string;
  readonly onUsernameChange: (value: string) => void;
  readonly onPasswordChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly isSubmitting: boolean;
  /** A captcha is required but not solved (or not loaded) yet. */
  readonly captchaBlocksSubmit: boolean;
  readonly captcha: CaptchaSectionProps;
  readonly error: string | null;
}

type PasswordFieldProps = Pick<
  CredentialsFormProps,
  'password' | 'onPasswordChange' | 'onSubmit' | 'isSubmitting'
>;

/** The password input with a Show / Hide toggle. */
function PasswordField({
  password,
  onPasswordChange,
  onSubmit,
  isSubmitting,
}: PasswordFieldProps): ReactElement {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <View style={styles.passwordRow}>
      <TextInput
        style={[formStyles.input, styles.passwordInput]}
        placeholder="Password"
        placeholderTextColor={SIGN_IN_COLORS.muted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={!showPassword}
        value={password}
        onChangeText={onPasswordChange}
        onSubmitEditing={onSubmit}
        editable={!isSubmitting}
      />
      <Pressable
        style={styles.passwordToggle}
        onPress={() => {
          setShowPassword((shown) => !shown);
        }}
        hitSlop={8}
      >
        <Text style={styles.passwordToggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
      </Pressable>
    </View>
  );
}

/** Username / email + password, the captcha, and the Sign In button. */
export function CredentialsForm(props: CredentialsFormProps): ReactElement {
  const { isSubmitting, onSubmit } = props;
  return (
    <View style={formStyles.card}>
      <Text style={formStyles.header}>Sign in to Floatplane</Text>
      <Text style={formStyles.description}>
        Use your Floatplane username or email and password.
      </Text>
      <TextInput
        style={formStyles.input}
        placeholder="Username or email"
        placeholderTextColor={SIGN_IN_COLORS.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={props.username}
        onChangeText={props.onUsernameChange}
        editable={!isSubmitting}
      />
      <PasswordField
        password={props.password}
        onPasswordChange={props.onPasswordChange}
        onSubmit={onSubmit}
        isSubmitting={isSubmitting}
      />
      <CaptchaSection {...props.captcha} />
      <FormError error={props.error} />
      <PrimaryButton
        label="Sign In"
        onPress={onSubmit}
        disabled={isSubmitting || props.captchaBlocksSubmit}
        waiting={isSubmitting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
    color: SIGN_IN_COLORS.tint,
  },
});
