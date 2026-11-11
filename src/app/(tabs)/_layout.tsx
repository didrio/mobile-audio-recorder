import { NativeTabs } from 'expo-router/native-tabs';
import { Platform } from 'react-native';

import { useTheme } from '@/theme';

/**
 * Native tab bar (UITabBarController with Liquid Glass on iOS, Material 3 navigation bar on
 * Android). Each tab is a folder with its own Stack so it gets native headers and push navigation.
 *
 * To add a tab: create `src/app/(tabs)/<name>/_layout.tsx` + `index.tsx` (copy `settings/`),
 * then add a `NativeTabs.Trigger` below. Icons: `sf` = SF Symbol (iOS), `md` = Material Symbol.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const isAndroid = Platform.OS === 'android';
  return (
    <NativeTabs
      tintColor={theme.colors.primary}
      backgroundColor={isAndroid ? theme.colors.background : undefined}
      indicatorColor={isAndroid ? theme.colors.surfacePressed : undefined}>
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Label>Ideas</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="waveform" md="graphic_eq" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
