import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme';

type Props = {
  /** The idea being renamed; `null` hides the dialog. */
  idea: { id: string; name: string } | null;
  onSubmit: (id: string, name: string) => void;
  onCancel: () => void;
};

/** A small cross-platform "Rename" prompt (`Alert.prompt` exists only on iOS). */
export function RenameIdeaDialog({ idea, onSubmit, onCancel }: Props) {
  return (
    <Modal visible={!!idea} transparent animationType="fade" onRequestClose={onCancel}>
      {idea ? <Body key={idea.id} idea={idea} onSubmit={onSubmit} onCancel={onCancel} /> : null}
    </Modal>
  );
}

function Body({
  idea,
  onSubmit,
  onCancel,
}: {
  idea: { id: string; name: string };
  onSubmit: Props['onSubmit'];
  onCancel: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const [name, setName] = useState(idea.name);
  const canSave = name.trim().length > 0;
  const save = () => {
    if (canSave) onSubmit(idea.id, name.trim());
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.backdrop}>
      <Pressable accessibilityLabel="Cancel" style={styles.scrim} onPress={onCancel} />
      <View style={styles.card}>
        <Text variant="headline">Rename idea</Text>
        <TextInput
          accessibilityLabel="Idea name"
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
