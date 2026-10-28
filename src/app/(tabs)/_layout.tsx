import { Platform } from 'react-native';
import { NativeTabs } from 'expo-router/native-tabs';

import { useThemeColor } from '@/shared';

export default function TabLayout() {
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
      tintColor={tintColor}
      iconColor={{ default: iconColor, selected: tintColor }}
      labelStyle={{ default: { color: iconColor }, selected: { color: tintColor } }}
    >
      <NativeTabs.Trigger name="index" contentStyle={{ backgroundColor }} disableAutomaticContentInsets={disableAutomaticContentInsets}>
        <NativeTabs.Trigger.Label>Videos</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'play.rectangle', selected: 'play.rectangle.fill' }} md="video_library" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings" contentStyle={{ backgroundColor }} disableAutomaticContentInsets={disableAutomaticContentInsets}>
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
