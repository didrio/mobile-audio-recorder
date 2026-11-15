import { useState } from 'react';
import { ActionSheetIOS, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { makeStyles } from '@/theme';

export type ActionMenuItem = { label: string; destructive?: boolean; onPress: () => void };

type Menu = { title: string; items: ActionMenuItem[] };

/**
 * A long-press menu with any number of items: the native action sheet on iOS, a small bottom sheet on
 * Android (its `Alert` holds only three buttons). Render `element` once in the screen, call `show`.
 */
export function useActionMenu() {
  const [menu, setMenu] = useState<Menu | null>(null);

  const show = (title: string, items: ActionMenuItem[]) => {
    if (Platform.OS === 'ios') {
      const destructive = items.findIndex((item) => item.destructive);
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          options: [...items.map((item) => item.label), 'Cancel'],
          ...(destructive >= 0 && { destructiveButtonIndex: destructive }),
          cancelButtonIndex: items.length,
        },
        (index) => items[index]?.onPress(),
      );
      return;
    }
    setMenu({ title, items });
  };

  const element =
    Platform.OS === 'ios' ? null : <ActionMenuSheet menu={menu} onClose={() => setMenu(null)} />;
  return { show, element };
}

function ActionMenuSheet({ menu, onClose }: { menu: Menu | null; onClose: () => void }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!menu} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close menu" style={styles.scrim} onPress={onClose} />
        {menu ? (
          <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
            <Text variant="footnote" color="textSecondary" style={styles.title} numberOfLines={1}>
              {menu.title}
            </Text>
            {[...menu.items, { label: 'Cancel', onPress: () => {} }].map((item) => (
              <Pressable
                key={item.label}
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  item.onPress();
                }}
                style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
                <Text color={'destructive' in item && item.destructive ? 'danger' : 'text'}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: t.colors.scrim,
  },
  sheet: {
    backgroundColor: t.colors.surface,
    borderTopLeftRadius: t.radius.lg,
    borderTopRightRadius: t.radius.lg,
    paddingTop: t.spacing.sm,
  },
  title: { paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm },
  item: { paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.md, minHeight: 48 },
  pressed: { backgroundColor: t.colors.surfacePressed },
}));
