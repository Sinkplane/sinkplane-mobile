import type { ReactElement } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';

import { useCreatorNotificationSettings } from '@/hooks/use-creator-notification-settings';
import {
  notificationsActive,
  useNotificationPreferences,
} from '@/hooks/use-notification-preferences';
import type { CreatorNotificationSettings } from '@/notifications/notification-settings-api';
import { useThemeColor } from '@/shared';

interface Props {
  readonly token: string | null | undefined;
}

/** Shown when the OS has notifications turned off for the app. */
function BlockedNotice(): ReactElement {
  const mutedColor = useThemeColor({}, 'icon');
  const linkColor = useThemeColor({}, 'link');
  return (
    <View style={styles.notice}>
      <Text style={[styles.hint, { color: mutedColor }]}>
        Notifications are turned off for Sinkplane in system settings.
      </Text>
      <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} hitSlop={8}>
        <Text style={[styles.link, { color: linkColor }]}>Open Settings</Text>
      </Pressable>
    </View>
  );
}

/**
 * Settings → Notifications: the new-post switch (backed by the OS permission) and, while it's on,
 * Floatplane's per-creator switches — "Notify me" (the push setting the app follows) and "Email"
 * (Floatplane's new-content email). Both per-creator switches are the same ones floatplane.com shows.
 */
export function NotificationSettings({ token }: Props): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const { preferences, isLoading, isUpdating, setEnabled } = useNotificationPreferences();
  const active = notificationsActive(preferences);
  const blocked = preferences?.permission === 'denied';

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={[styles.label, { color: textColor }]}>New post notifications</Text>
          <Text style={[styles.hint, { color: mutedColor }]}>
            Instantly while the app is open, and every 15 minutes or so in the background.
          </Text>
        </View>
        <Switch
          testID="notifications-switch"
          accessibilityLabel="New post notifications"
          value={active}
          disabled={isLoading || isUpdating}
          onValueChange={(value) => void setEnabled(value).catch(() => undefined)}
        />
      </View>
      {blocked ? <BlockedNotice /> : null}
      {active ? <CreatorSwitches token={token} /> : null}
    </View>
  );
}

function ColumnHeader(): ReactElement {
  const mutedColor = useThemeColor({}, 'icon');
  return (
    <View style={styles.columns}>
      <Text style={[styles.switchCell, styles.columnLabel, { color: mutedColor }]}>Notify me</Text>
      <Text style={[styles.switchCell, styles.columnLabel, { color: mutedColor }]}>Email</Text>
    </View>
  );
}

function CreatorSwitches({ token }: Props): ReactElement | null {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const { settings, isLoading, isError, refetch, update, updateError } =
    useCreatorNotificationSettings(token);

  if (isLoading) {
    return <ActivityIndicator style={styles.loading} />;
  }
  if (isError) {
    return (
      <Pressable accessibilityRole="button" onPress={() => void refetch()} style={styles.notice}>
        <Text style={[styles.hint, { color: mutedColor }]}>
          Couldn’t load creator settings. Tap to retry.
        </Text>
      </Pressable>
    );
  }
  if (settings === undefined || settings.length === 0) {
    return null;
  }

  return (
    <View style={styles.creators}>
      <ColumnHeader />
      {settings.map((creator) => (
        <CreatorRow
          key={creator.creatorId}
          creator={creator}
          textColor={textColor}
          onChange={update}
        />
      ))}
      {updateError === null ? null : (
        <Text style={[styles.hint, { color: mutedColor }]}>
          Couldn’t save that change. Please try again.
        </Text>
      )}
    </View>
  );
}

interface CreatorRowProps {
  readonly creator: CreatorNotificationSettings;
  readonly textColor: string;
  readonly onChange: (
    creatorId: string,
    property: 'contentFirebase' | 'contentEmail',
    value: boolean,
  ) => void;
}

function CreatorRow({ creator, textColor, onChange }: CreatorRowProps): ReactElement {
  return (
    <View style={styles.creatorRow} testID={`creator-notifications-${creator.creatorId}`}>
      {creator.iconUrl === null || creator.iconUrl === '' ? null : (
        <Image source={{ uri: creator.iconUrl }} style={styles.icon} contentFit="cover" />
      )}
      <Text style={[styles.creatorTitle, { color: textColor }]} numberOfLines={1}>
        {creator.title}
      </Text>
      <View style={styles.switchCell}>
        <Switch
          accessibilityLabel={`Notifications for ${creator.title}`}
          value={creator.contentFirebase}
          onValueChange={(value) => {
            onChange(creator.creatorId, 'contentFirebase', value);
          }}
        />
      </View>
      <View style={styles.switchCell}>
        <Switch
          accessibilityLabel={`Emails for ${creator.title}`}
          value={creator.contentEmail}
          onValueChange={(value) => {
            onChange(creator.creatorId, 'contentEmail', value);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    marginRight: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
    marginTop: 4,
  },
  notice: {
    marginTop: 12,
  },
  link: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 6,
  },
  loading: {
    marginTop: 16,
  },
  creators: {
    marginTop: 16,
  },
  columns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  switchCell: {
    width: 72,
    alignItems: 'center',
  },
  columnLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 10,
  },
  creatorTitle: {
    flex: 1,
    fontSize: 15,
    marginRight: 8,
  },
});
