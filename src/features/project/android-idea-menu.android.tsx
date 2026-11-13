import {
  DropdownMenu,
  DropdownMenuItem,
  Host,
  RNHostView,
  Text as ComposeText,
} from '@expo/ui/jetpack-compose';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { Icon } from '@/components/ui';
import { makeStyles } from '@/theme';

import { IDEA_MENU_ITEMS } from './idea-menu-items';

/**
 * Android's "⋯" header button and its Material dropdown (`@expo/ui`). The trigger is an RN
 * Pressable so it matches the other header buttons. iOS uses `Stack.Toolbar.Menu` instead.
 */
export function AndroidIdeaMenu() {
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);
  return (
    <Host matchContents>
      <DropdownMenu expanded={expanded} onDismissRequest={() => setExpanded(false)}>
        <DropdownMenu.Trigger>
          <RNHostView matchContents>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="More"
              hitSlop={8}
              onPress={() => setExpanded(true)}
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Icon name={{ ios: 'ellipsis', android: 'more_vert' }} size={24} />
            </Pressable>
          </RNHostView>
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          {IDEA_MENU_ITEMS.map((item) => (
            <DropdownMenuItem key={item.label} enabled={false}>
              <DropdownMenuItem.Text>
                <ComposeText>{item.label}</ComposeText>
              </DropdownMenuItem.Text>
            </DropdownMenuItem>
          ))}
        </DropdownMenu.Items>
      </DropdownMenu>
    </Host>
  );
}

const useStyles = makeStyles((t) => ({
  button: { padding: t.spacing.sm, borderRadius: t.radius.full },
  pressed: { opacity: 0.7 },
}));
