import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { imagePath, type ApiImage } from '@/components/image-path';
import { useThemeColor, type User } from '@/shared';

/** The signed-in user as the session may hold it (the API can omit the avatar). */
type ProfileUser = Pick<User, 'username' | 'displayName'> & {
  readonly profileImage?: ApiImage | null;
};

function Avatar({ user }: Readonly<{ user: ProfileUser | undefined }>): ReactElement {
  const avatarPath = imagePath(user?.profileImage);
  if (avatarPath !== undefined) {
    return <Image source={{ uri: avatarPath }} style={styles.avatar} contentFit="cover" />;
  }
  return (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarText}>{(user?.username ?? '?').charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function displayNameOf(user: ProfileUser | undefined): string {
  return user?.displayName ?? user?.username ?? 'Signed in';
}

/** Settings header: the avatar (or the username's initial), display name and handle. */
export function ProfileHeader({ user }: Readonly<{ user: ProfileUser | undefined }>): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  return (
    <View style={styles.profileRow}>
      <Avatar user={user} />
      <View style={styles.profileMeta}>
        <Text style={[styles.title, { color: textColor }]}>{displayNameOf(user)}</Text>
        <Text style={[styles.body, { color: mutedColor }]}>@{user?.username}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  body: {
    fontSize: 15,
  },
});
