import { StyleSheet } from 'react-native';

import { Colors } from '@/shared';

/**
 * The sign-in screen sits on a photo background, so it uses a fixed light-on-dark palette
 * regardless of the app theme (same treatment as the TV sign-in screen).
 */
export const SIGN_IN_COLORS = {
  text: '#fff',
  muted: 'rgba(255, 255, 255, 0.8)',
  tint: Colors.light.tint,
  inputBackground: 'rgba(0, 0, 0, 0.45)',
} as const;

/** Styles the credentials and two-factor forms share. */
export const formStyles = StyleSheet.create({
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
    color: SIGN_IN_COLORS.text,
  },
  description: {
    fontSize: 15,
    marginBottom: 24,
    textAlign: 'center',
    color: SIGN_IN_COLORS.muted,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
    color: SIGN_IN_COLORS.text,
    backgroundColor: SIGN_IN_COLORS.inputBackground,
  },
});
