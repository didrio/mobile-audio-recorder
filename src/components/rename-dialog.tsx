import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme';

type Props = {
  /** What is being renamed; `null` hides the dialog. */
  item: { id: string; name: string } | null;
  /** E.g. "Rename idea". */
  title: string;
  /** Accessibility label of the name field, e.g. "Idea name". */
  inputLabel: string;
  maxLength?: number;
  onSubmit: (id: string, name: string) => void;
  onCancel: () => void;
};

/** A small cross-platform "Rename" prompt (`Alert.prompt` exists only on iOS). */
export function RenameDialog({ item, ...props }: Props) {
  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={props.onCancel}>
      {item ? <Body key={item.id} item={item} {...props} /> : null}
    </Modal>
  );
}

function Body({
  item,
  title,
  inputLabel,
  maxLength,
  onSubmit,
  onCancel,
}: Omit<Props, 'item'> & { item: { id: string; name: string } }) {
  const styles = useStyles();
  const theme = useTheme();
  const [name, setName] = useState(item.name);
  const canSave = name.trim().length > 0;
  const save = () => {
    if (canSave) onSubmit(item.id, name.trim());
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.backdrop}>
      <Pressable accessibilityLabel="Cancel" style={styles.scrim} onPress={onCancel} />
      <View style={styles.card}>
        <Text variant="headline">{title}</Text>
        <TextInput
          accessibilityLabel={inputLabel}
          maxLength={maxLength}
          autoFocus
          selectTextOnFocus
          value={name}
          onChangeText={setName}
          onSubmitEditing={save}
          returnKeyType="done"
          placeholderTextColor={theme.colors.textTertiary}
          style={styles.input}
        />
        <View style={styles.buttons}>
          <Button title="Cancel" variant="plain" onPress={onCancel} />
          <Button title="Save" disabled={!canSave} onPress={save} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((t) => ({
  backdrop: { flex: 1, justifyContent: 'center', padding: t.spacing.xl },
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: t.colors.scrim,
  },
  card: {
    gap: t.spacing.lg,
    padding: t.spacing.xl,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surface,
  },
  input: {
    minHeight: 44,
    paddingHorizontal: t.spacing.md,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.background,
    color: t.colors.text,
    ...t.typography.body,
  },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: t.spacing.sm },
}));
