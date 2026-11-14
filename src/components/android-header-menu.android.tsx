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

import { Icon } from '@/components/ui';
import { makeStyles } from '@/theme';

import type { AndroidHeaderMenuProps } from './android-header-menu';

/**
 * An icon header button with a Material dropdown (`@expo/ui`). The trigger is an RN Pressable so it
 * matches the other header buttons. iOS uses `Stack.Toolbar.Menu` instead.
 */
export function AndroidHeaderMenu({ label, icon, items }: AndroidHeaderMenuProps) {
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
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Icon name={icon} size={24} />
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
  pressed: { opacity: 0.7 },
}));
