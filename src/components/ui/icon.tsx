import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme, type ColorName } from '@/theme';

type PlatformSymbolNames = Exclude<SymbolViewProps['name'], string>;

/**
 * A native system icon: an SF Symbol on iOS and a Material Symbol on Android.
 * Both names are required so icons never silently disappear on one platform.
 *
 * - iOS names: https://developer.apple.com/sf-symbols/ (e.g. `gearshape`, `house.fill`)
 * - Android names: https://fonts.google.com/icons (snake_case, e.g. `settings`, `home`)
 *
 * Icons are decorative by default: hidden from screen readers, so a button reads as its own label
 * (otherwise iOS announces the SF Symbol name, e.g. "microphone, Record"). Pass `accessibilityLabel`
 * for an icon that carries meaning on its own.
 */
export type IconName = {
  ios: NonNullable<PlatformSymbolNames['ios']>;
  android: NonNullable<PlatformSymbolNames['android']>;
};

export type IconProps = {
  name: IconName;
  size?: number;
  color?: ColorName;
  style?: StyleProp<ViewStyle>;
  /** Only for icons that mean something on their own; otherwise the icon is hidden from screen readers. */
  accessibilityLabel?: string;
};

export function Icon({ name, size = 20, color = 'text', style, accessibilityLabel }: IconProps) {
  const theme = useTheme();
  const decorative = accessibilityLabel == null;
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={theme.colors[color]}
      accessible={!decorative}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
      style={[{ width: size, height: size }, style]}
    />
  );
}
