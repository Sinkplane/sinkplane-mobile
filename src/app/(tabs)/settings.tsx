import { useState, type ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { ProfileHeader } from '@/components/settings/ProfileHeader';
import { SubscriptionList } from '@/components/settings/SubscriptionList';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { useTabScreenInsets } from '@/hooks/use-tab-screen-insets';
import { logout, useSession, useThemeColor } from '@/shared';

/** Breathing room below the sign-out button, on top of the tab bar inset. */
const CONTENT_BOTTOM_PADDING = 32;

/** Best effort: invalidates the session server-side, then always clears it locally. */
function useSignOut(): { isSigningOut: boolean; handleSignOut: () => void } {
  const { token, signOut } = useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = () => {
    setIsSigningOut(true);
    const serverLogout =
      token === null || token === undefined || token === ''
        ? Promise.resolve()
        : logout(token).catch(() => undefined);
    void serverLogout.finally(() => {
      signOut();
      setIsSigningOut(false);
    });
  };

  return { isSigningOut, handleSignOut };
}

function SignOutButton(): ReactElement {
  // The shared dark tint (#aaa) is too light behind white button text.
  const buttonColor = useThemeColor({}, 'link');
  const { isSigningOut, handleSignOut } = useSignOut();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.signOutButton,
        { backgroundColor: buttonColor },
        (pressed || isSigningOut) && styles.buttonPressed,
      ]}
      onPress={handleSignOut}
      disabled={isSigningOut}
    >
      <Text style={styles.buttonText}>{isSigningOut ? 'Signing Out...' : 'Sign Out'}</Text>
    </Pressable>
  );
}

function Section({
  title,
  children,
}: Readonly<{ title: string; children: ReactElement }>): ReactElement {
  const textColor = useThemeColor({}, 'text');
  return (
    <>
      <Text style={[styles.sectionHeader, { color: textColor }]}>{title}</Text>
      {children}
    </>
  );
}

export default function Settings(): ReactElement {
  const { user, subscriptions, creators, token, isLoading } = useSession();
  const insets = useTabScreenInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const mutedColor = useThemeColor({}, 'icon');

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor }]}>
        <Text style={[styles.body, { color: mutedColor }]}>Loading your profile...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + CONTENT_BOTTOM_PADDING },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <ProfileHeader user={user} />
        <Section title="Appearance">
          <View style={styles.section}>
            <ThemeSwitcher />
          </View>
        </Section>
        <Section title="Notifications">
          <View style={styles.section}>
            <NotificationSettings token={token} />
          </View>
        </Section>
        <Section title="Subscriptions">
          <SubscriptionList subscriptions={subscriptions} creators={creators} />
        </Section>
        <SignOutButton />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 24,
    paddingBottom: 32,
    // Keeps the cards and the button at a readable width on tablets.
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
  },
  signOutButton: {
    marginTop: 28,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
