import { Platform } from 'react-native';
import { NativeTabs } from 'expo-router/native-tabs';

import { LIVE_RED } from '@/components/live/LiveStatusPill';
import { useLiveStreams } from '@/hooks/use-live-streams';
import { useNotificationNavigation } from '@/hooks/use-notification-navigation';
import { useSession, useThemeColor } from '@/shared';

export default function TabLayout() {
  // Tapped notifications open their video (this layout only exists while signed in).
  useNotificationNavigation();
  const { token, creators } = useSession();
  // Polls every subscribed creator's livestream (also while the live player page is open on top),
  // badging the Live tab while anyone is live. The tab itself always shows: dynamically hiding a
  // native tab remounts the navigator and resets every tab's state.
  const isLive = useLiveStreams(token, creators, { poll: true }).some(stream => stream.status === 'live');
  const backgroundColor = useThemeColor({}, 'background');
  // The shared dark tint (#aaa) is nearly indistinguishable from the unselected icon color.
  const tintColor = useThemeColor({ dark: '#fff' }, 'tabIconSelected');
  const iconColor = useThemeColor({}, 'tabIconDefault');
  // iOS automatic insets leave the status bar uncovered; screens pad themselves via useTabScreenInsets.
  // (Android-side this flag would also drop the bottom safe-area wrapper, so keep it iOS-only.)
  const disableAutomaticContentInsets = Platform.OS === 'ios';

  return (
    <NativeTabs
      backgroundColor={backgroundColor}
      badgeBackgroundColor={LIVE_RED}
      tintColor={tintColor}
      iconColor={{ default: iconColor, selected: tintColor }}
      labelStyle={{ default: { color: iconColor }, selected: { color: tintColor } }}
    >
      <NativeTabs.Trigger name="index" contentStyle={{ backgroundColor }} disableAutomaticContentInsets={disableAutomaticContentInsets}>
        <NativeTabs.Trigger.Label>Videos</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'play.rectangle', selected: 'play.rectangle.fill' }} md="video_library" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="history" contentStyle={{ backgroundColor }} disableAutomaticContentInsets={disableAutomaticContentInsets}>
        <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'clock', selected: 'clock.fill' }} md="history" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="live" contentStyle={{ backgroundColor }} disableAutomaticContentInsets={disableAutomaticContentInsets}>
        <NativeTabs.Trigger.Label>Live</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="dot.radiowaves.left.and.right" md="live_tv" />
        {/* Not `hidden`: a Badge with text ignores it. */}
        {isLive ? <NativeTabs.Trigger.Badge selectedBackgroundColor={LIVE_RED}>LIVE</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings" contentStyle={{ backgroundColor }} disableAutomaticContentInsets={disableAutomaticContentInsets}>
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
