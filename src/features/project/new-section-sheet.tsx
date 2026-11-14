import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { formatTimecode } from '@/features/audio/format-time';
import { barSeconds } from '@/features/audio/tempo';
import { makeStyles, useTheme } from '@/theme';

import { addSection, useEditorStore } from './editor-store';
import { SectionSwatches } from './section-swatches';
import {
  DEFAULT_SECTION_COLOR,
  presetName,
  SECTION_NAME_MAX,
  SECTION_PRESETS,
  sectionColorToken,
  type SectionColor,
} from './sections';

/**
 * The picker that opens from a tap on an empty spot of the section rail (T18): a preset (numbered when
 * it's already used: "Verse 2") or a custom name and color. The spot and length come in the route
 * params, worked out by the timeline (`newSectionWindow`). Adding is one undo step.
 */
export function NewSectionSheet() {
  const params = useLocalSearchParams<{ projectId: string; start: string; duration: string }>();
  const project = useEditorStore((state) =>
    state.projectId === params.projectId ? state.project : null,
  );
  const start = Number(params.start);
  const duration = Number(params.duration);
  if (!project || !Number.isFinite(start) || !Number.isFinite(duration)) return null;
  const startLabel = project.grid
    ? `Starts at bar ${Math.round(start / barSeconds(project)) + 1}`
    : `Starts at ${formatTimecode(start)}`;
  return (
    <NewSectionForm
      start={start}
      duration={duration}
      startLabel={startLabel}
      existingNames={project.sections.map((section) => section.name)}
    />
  );
}

function NewSectionForm({
  start,
  duration,
  startLabel,
  existingNames,
}: {
  start: number;
  duration: number;
  startLabel: string;
  existingNames: string[];
}) {
  const styles = useStyles();
  const theme = useTheme();
  const router = useRouter();
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<SectionColor>(DEFAULT_SECTION_COLOR);

  const add = (sectionName: string, sectionColor: SectionColor) => {
    if (!sectionName.trim()) return;
    void Haptics.selectionAsync();
    addSection({ name: sectionName, color: sectionColor, start, duration });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text variant="headline" accessibilityRole="header" align="center">
          New section
        </Text>
        <Text variant="footnote" color="textSecondary" align="center">
          {startLabel}
        </Text>
      </View>
      <View style={styles.presets}>
        {SECTION_PRESETS.map((preset) => {
          const presetLabel = presetName(preset.name, existingNames);
          return (
            <Pressable
              key={preset.name}
              accessibilityRole="button"
              accessibilityLabel={presetLabel}
              onPress={() => add(presetLabel, preset.color)}
              style={({ pressed }) => [
                styles.preset,
                { backgroundColor: theme.colors[sectionColorToken(preset.color)] },
                pressed && styles.pressed,
              ]}>
              <Text variant="headline" color="onSection" numberOfLines={1}>
                {presetLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {custom ? (
        <View style={styles.custom}>
          <TextInput
            accessibilityLabel="Section name"
            placeholder="Name"
            autoFocus
            autoCapitalize="words"
            maxLength={SECTION_NAME_MAX}
            value={name}
            onChangeText={setName}
            onSubmitEditing={() => add(name, color)}
            returnKeyType="done"
            placeholderTextColor={theme.colors.textTertiary}
            style={styles.input}
          />
          <SectionSwatches value={color} onChange={setColor} />
          <Button title="Add section" disabled={!name.trim()} onPress={() => add(name, color)} />
        </View>
      ) : (
        <Button
          title="Custom…"
          variant="secondary"
          icon={{ ios: 'textformat', android: 'text_fields' }}
          onPress={() => setCustom(true)}
        />
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((t) => ({
  root: { padding: t.spacing.lg, paddingTop: t.spacing.xl, gap: t.spacing.lg },
  header: { gap: t.spacing.xxs },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  preset: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: t.spacing.md,
    borderRadius: t.radius.md,
  },
  pressed: { opacity: 0.7 },
  custom: { gap: t.spacing.md },
  input: {
    ...t.typography.body,
    color: t.colors.text,
    backgroundColor: t.colors.surfaceMuted,
    borderRadius: t.radius.md,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
  },
}));
