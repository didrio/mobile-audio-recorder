import { Button, Divider, HStack, Host, Image, Menu, Text } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  disabled,
  font,
  foregroundStyle,
  frame,
  lineLimit,
} from '@expo/ui/swift-ui/modifiers';
import { Fragment } from 'react';
import { useWindowDimensions } from 'react-native';

import type { IconName } from '@/components/ui';
import { useTheme } from '@/theme';

export type IdeaTitleMenuItem = {
  label: string;
  icon: IconName;
  destructive?: boolean;
  disabled?: boolean;
  onPress?: () => void;
};

export type IdeaTitleMenuProps = { title: string; items: IdeaTitleMenuItem[] };

/**
 * The idea's name in the header, with a chevron; tapping it opens the idea's file actions (T44), like the
 * title menu of Apple's document apps. iOS: a SwiftUI `Menu`; Android: `idea-title-menu.android.tsx`.
 * Destructive items get a divider above them.
 *
 * The native header gives a custom title no size of its own, so the Host gets an explicit frame: the
 * room between the back button and the right-hand buttons, with the label at its leading edge like a
 * plain title (a long name truncates). Title in the text color, chevron secondary (not the tint).
 */
export function IdeaTitleMenu({ title, items }: IdeaTitleMenuProps) {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.max(MIN_WIDTH, windowWidth - SIDE_ROOM);
  return (
    <Host alignment="leading" style={{ width, height: HEIGHT }}>
      <Menu
        modifiers={[accessibilityLabel(`${title}, idea actions`)]}
        label={
          <HStack spacing={4} modifiers={[frame({ maxWidth: width, alignment: 'leading' })]}>
            <Text
              modifiers={[
                font({ textStyle: 'headline' }),
                lineLimit(1),
                foregroundStyle(theme.colors.text),
              ]}>
              {title}
            </Text>
            <Image systemName="chevron.down" size={12} color={theme.colors.textSecondary} />
          </HStack>
        }>
        {items.map((item) => (
          <Fragment key={item.label}>
            {item.destructive ? <Divider /> : null}
            <Button
              label={item.label}
              systemImage={item.icon.ios}
              role={item.destructive ? 'destructive' : 'default'}
              onPress={item.onPress}
              modifiers={[disabled(item.disabled || !item.onPress)]}
            />
          </Fragment>
        ))}
      </Menu>
    </Host>
  );
}

/** Back button and the Undo · Redo · Settings group, with their margins (iOS 26 header). */
const SIDE_ROOM = 250;
const MIN_WIDTH = 100;
const HEIGHT = 36;
