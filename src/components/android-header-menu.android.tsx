import {
  DropdownMenu,
  DropdownMenuItem,
  Host,
  RNHostView,
  SelectableDropdownMenuItem,
  Text as ComposeText,
} from '@expo/ui/jetpack-compose';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { makeStyles } from '@/theme';

import type { AndroidHeaderMenuProps } from './android-header-menu';

/**
 * A header button with a Material dropdown (`@expo/ui`): an icon, or a title with a drop-down arrow.
 * The trigger is an RN Pressable so it matches the other header buttons. iOS uses
 * `Stack.Toolbar.Menu` (or a SwiftUI title menu) instead.
 */
export function AndroidHeaderMenu({ label, icon, title, items }: AndroidHeaderMenuProps) {
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);
  return (
    <Host matchContents>
      <DropdownMenu expanded={expanded} onDismissRequest={() => setExpanded(false)}>
        <DropdownMenu.Trigger>
          <RNHostView matchContents>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={label}
              hitSlop={8}
              onPress={() => setExpanded(true)}
              style={({ pressed }) => [
                title != null ? styles.titleButton : styles.button,
                pressed && styles.pressed,
              ]}>
              {title != null ? (
                <>
                  <Text variant="headline" numberOfLines={1} style={styles.title}>
                    {title}
                  </Text>
                  <Icon
                    name={{ ios: 'chevron.down', android: 'arrow_drop_down' }}
                    size={24}
                    color="textSecondary"
                  />
                </>
              ) : icon ? (
                <Icon name={icon} size={24} />
              ) : null}
            </Pressable>
          </RNHostView>
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          {items.map((item) => {
            const onClick = () => {
              setExpanded(false);
              item.onPress?.();
            };
            const text = (
              <DropdownMenuItem.Text>
                <ComposeText>{item.label}</ComposeText>
              </DropdownMenuItem.Text>
            );
            return item.selected === undefined ? (
              <DropdownMenuItem
                key={item.label}
                enabled={!item.disabled && !!item.onPress}
                onClick={onClick}>
                {text}
              </DropdownMenuItem>
            ) : (
              <SelectableDropdownMenuItem
                key={item.label}
                selected={item.selected}
                enabled={!item.disabled}
                onClick={onClick}>
                {text}
              </SelectableDropdownMenuItem>
            );
          })}
        </DropdownMenu.Items>
      </DropdownMenu>
    </Host>
  );
}

const useStyles = makeStyles((t) => ({
  button: { padding: t.spacing.sm, borderRadius: t.radius.full },
  titleButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: t.spacing.xs },
  title: { flexShrink: 1 },
  pressed: { opacity: 0.7 },
}));
