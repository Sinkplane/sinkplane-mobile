import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';

import { logout, useSession, useThemeColor } from '@/shared';

export default function Home() {
  const { user, subscriptions, creators, token, isLoading, signOut } = useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const tintColor = useThemeColor({}, 'tint');

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      // Best effort: invalidate the session server-side, then clear locally.
      if (token) await logout(token).catch(() => undefined);
    } finally {
      signOut();
      setIsSigningOut(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor }]}>
        <Text style={[styles.body, { color: mutedColor }]}>Loading your profile...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileRow}>
          {user?.profileImage?.path ? (
            <Image source={{ uri: user.profileImage.path }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarText}>{(user?.username ?? '?').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.profileMeta}>
            <Text style={[styles.title, { color: textColor }]}>{user?.displayName ?? user?.username ?? 'Signed in'}</Text>
            <Text style={[styles.body, { color: mutedColor }]}>@{user?.username}</Text>
          </View>
        </View>

        <Text style={[styles.sectionHeader, { color: textColor }]}>Subscriptions</Text>
        {subscriptions && subscriptions.length > 0 ? (
          subscriptions.map(subscription => {
            const creator = creators?.find(c => c.id === subscription.creator);
            return (
            <View key={subscription.creator} style={[styles.card, { borderColor: `${mutedColor}22` }]}>
              <Text style={[styles.cardTitle, { color: textColor }]}>
                {creator?.title ?? creator?.owner?.username ?? `Creator ${subscription.creator}`}
              </Text>
              <Text style={[styles.body, { color: mutedColor }]}>{subscription.plan?.title ?? 'Active'}</Text>
            </View>
            );
          })
        ) : (
          <Text style={[styles.body, { color: mutedColor }]}>No subscriptions found.</Text>
        )}
      </ScrollView>

      <Pressable
        style={({ pressed }) => [
          styles.signOutButton,
          { backgroundColor: tintColor },
          (pressed || isSigningOut) && styles.buttonPressed,
        ]}
        onPress={handleSignOut}
        disabled={isSigningOut}
      >
        <Text style={styles.buttonText}>{isSigningOut ? 'Signing Out...' : 'Sign Out'}</Text>
      </Pressable>
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
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
  },
  profileMeta: {
    marginLeft: 16,
    flex: 1,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarFallback: {
    backgroundColor: '#0085FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  body: {
    fontSize: 15,
  },
  signOutButton: {
    margin: 24,
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
