import type { ReactElement } from 'react';
import { Platform } from 'react-native';
import { NativeTabs } from 'expo-router/native-tabs';

import { LIVE_RED } from '@/components/live/LiveStatusPill';
import { useLiveStreams } from '@/hooks/use-live-streams';
import { useNotificationNavigation } from '@/hooks/use-notification-navigation';
import { useSession, useThemeColor } from '@/shared';

/** Whether any subscribed creator is live right now. */
function useAnyoneLive(): boolean {
  const { token, creators } = useSession();
  // Polls every subscribed creator's livestream (also while the live player page is open on top),
  // badging the Live tab while anyone is live. The tab itself always shows: dynamically hiding a
  // native tab remounts the navigator and resets every tab's state.
  return useLiveStreams(token, creators, { poll: true }).some((stream) => stream.status === 'live');
}

function useTabColors(): { backgroundColor: string; tintColor: string; iconColor: string } {
  const backgroundColor = useThemeColor({}, 'background');
  // The shared dark tint (#aaa) is nearly indistinguishable from the unselected icon color.
  const tintColor = useThemeColor({ dark: '#fff' }, 'tabIconSelected');
  const iconColor = useThemeColor({}, 'tabIconDefault');
  return { backgroundColor, tintColor, iconColor };
}

// iOS automatic insets leave the status bar uncovered; screens pad themselves via useTabScreenInsets.
// (Android-side this flag would also drop the bottom safe-area wrapper, so keep it iOS-only.)
const DISABLE_AUTOMATIC_CONTENT_INSETS = Platform.OS === 'ios';

/** Options every tab trigger shares. */
function triggerOptions(backgroundColor: string) {
  return {
    contentStyle: { backgroundColor },
    disableAutomaticContentInsets: DISABLE_AUTOMATIC_CONTENT_INSETS,
  };
}

const VIDEOS_ICON = { default: 'play.rectangle', selected: 'play.rectangle.fill' } as const;
const HISTORY_ICON = { default: 'clock', selected: 'clock.fill' } as const;
const SETTINGS_ICON = { default: 'gearshape', selected: 'gearshape.fill' } as const;

export default function TabLayout(): ReactElement {
  // Tapped notifications open their video (this layout only exists while signed in).
  useNotificationNavigation();
  const isLive = useAnyoneLive();
  const { backgroundColor, tintColor, iconColor } = useTabColors();
  const trigger = triggerOptions(backgroundColor);

  return (
    <NativeTabs
      backgroundColor={backgroundColor}
      badgeBackgroundColor={LIVE_RED}
      tintColor={tintColor}
      iconColor={{ default: iconColor, selected: tintColor }}
      labelStyle={{ default: { color: iconColor }, selected: { color: tintColor } }}
    >
      <NativeTabs.Trigger name="index" {...trigger}>
        <NativeTabs.Trigger.Label>Videos</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={VIDEOS_ICON} md="video_library" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="history" {...trigger}>
        <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={HISTORY_ICON} md="history" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="live" {...trigger}>
        <NativeTabs.Trigger.Label>Live</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="dot.radiowaves.left.and.right" md="live_tv" />
        {/* Not `hidden`: a Badge with text ignores it. */}
        {isLive ? (
          <NativeTabs.Trigger.Badge selectedBackgroundColor={LIVE_RED}>
            LIVE
          </NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings" {...trigger}>
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={SETTINGS_ICON} md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
