import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Switch, TextInput, View } from 'react-native';

import {
  Button,
  Icon,
  ListRow,
  ListSection,
  Screen,
  SegmentedControl,
  Text,
  type IconName,
} from '@/components/ui';
import {
  addTap,
  BPM_MAX,
  BPM_MIN,
  bpmFromTaps,
  clampBpm,
  TIME_SIGNATURES,
  timeSignatureLabel,
} from '@/features/audio/tempo';
import { makeStyles, useTheme } from '@/theme';

import { setIdeaSettings, useEditorStore } from './editor-store';

/** Tempo changes (steppers, tap tempo) are saved as one undo step once they stop for this long. */
const COMMIT_DELAY_MS = 700;

const signatureOptions = TIME_SIGNATURES.map(({ beatsPerBar, beatUnit }) => ({
  value: timeSignatureLabel(beatsPerBar, beatUnit),
  label: timeSignatureLabel(beatsPerBar, beatUnit),
}));

/**
 * Idea settings, shown as a sheet over the open idea (editor store): name, tempo (stepper, typed
 * value or Tap tempo), time signature and the grid switch. Every change is one undo step from the
 * idea's header. Tempo changes made in quick succession become one step. Setting a different
 * tempo turns the grid on (`setIdeaSettingsEdit`).
 */
export function IdeaSettingsSheet() {
  const params = useLocalSearchParams<{ id: string }>();
  const open = useEditorStore((state) => state.projectId === params.id && state.project != null);
  return open ? <IdeaSettingsForm /> : null;
}

function IdeaSettingsForm() {
  const styles = useStyles();
  const theme = useTheme();
  const project = useEditorStore((state) => state.project)!;

  const [name, setName] = useState(project.name);
  const [bpm, setBpm] = useState(project.bpm);
  const [bpmText, setBpmText] = useState(String(project.bpm));
  const pendingBpm = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taps = useRef<number[]>([]);

  const commitBpm = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pendingBpm.current == null) return;
    const value = pendingBpm.current;
    pendingBpm.current = null;
    void setIdeaSettings({ bpm: value });
  };
  // Closing the sheet saves a tempo change that is still waiting.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (pendingBpm.current != null) void setIdeaSettings({ bpm: pendingBpm.current });
    },
    [],
  );

  /** Shows `value` now and saves it once the changes stop. */
  const changeBpm = (value: number) => {
    const next = clampBpm(value);
    setBpm(next);
    setBpmText(String(next));
    pendingBpm.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(commitBpm, COMMIT_DELAY_MS);
  };

  const saveName = () => {
    const trimmed = name.trim();
    if (trimmed) void setIdeaSettings({ name: trimmed });
    else setName(project.name);
  };

  const tapTempo = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    taps.current = addTap(taps.current, Date.now());
    const tapped = bpmFromTaps(taps.current);
    if (tapped != null) changeBpm(tapped);
  };

  const signature = timeSignatureLabel(project.beatsPerBar, project.beatUnit);

  return (
    <Screen grouped contentContainerStyle={styles.content}>
      <Text variant="headline" accessibilityRole="header" align="center">
        Idea settings
      </Text>

      <ListSection title="Name">
        <View style={styles.inputRow}>
          <TextInput
            accessibilityLabel="Idea name"
            value={name}
            onChangeText={setName}
            onSubmitEditing={saveName}
            onBlur={saveName}
            returnKeyType="done"
            autoCapitalize="words"
            maxLength={60}
            selectTextOnFocus
            placeholderTextColor={theme.colors.textTertiary}
            style={styles.input}
          />
        </View>
      </ListSection>

      <ListSection title="Tempo">
        <View style={styles.tempoRow}>
          <Text style={styles.tempoLabel}>BPM</Text>
          <StepButton
            label="Slower"
            icon={{ ios: 'minus', android: 'remove' }}
            disabled={bpm <= BPM_MIN}
            onPress={() => changeBpm(bpm - 1)}
          />
          <TextInput
            accessibilityLabel="Tempo in beats per minute"
            value={bpmText}
            onChangeText={(text) => setBpmText(text.replace(/[^0-9]/g, '').slice(0, 3))}
            onEndEditing={() => {
              const typed = Number(bpmText);
              if (bpmText === '' || !Number.isFinite(typed)) {
                setBpmText(String(bpm));
              } else {
                changeBpm(typed);
                commitBpm();
              }
            }}
            keyboardType="number-pad"
            returnKeyType="done"
            selectTextOnFocus
            style={styles.bpmInput}
          />
          <StepButton
            label="Faster"
            icon={{ ios: 'plus', android: 'add' }}
            disabled={bpm >= BPM_MAX}
            onPress={() => changeBpm(bpm + 1)}
          />
        </View>
        <View style={styles.tapRow}>
          <Button
            title="Tap tempo"
            variant="secondary"
            icon={{ ios: 'hand.tap', android: 'touch_app' }}
            haptic={false}
            onPress={tapTempo}
          />
        </View>
      </ListSection>

      <ListSection title="Time signature">
        <View style={styles.segmentRow}>
          <SegmentedControl
            accessibilityLabel="Time signature"
            options={signatureOptions}
            value={signature}
            onChange={(value) => {
              const next = TIME_SIGNATURES.find(
                (candidate) =>
                  timeSignatureLabel(candidate.beatsPerBar, candidate.beatUnit) === value,
              );
              if (next) {
                void setIdeaSettings({ beatsPerBar: next.beatsPerBar, beatUnit: next.beatUnit });
              }
            }}
          />
        </View>
      </ListSection>

      <ListSection title="Grid">
        <ListRow
          title="Show bars and beats"
          accessory={
            <Switch
              accessibilityLabel="Grid"
              value={project.grid}
              onValueChange={(grid) => void setIdeaSettings({ grid })}
              trackColor={{ true: theme.colors.primary }}
            />
          }
        />
      </ListSection>

      <Text variant="footnote" color="textSecondary" style={styles.footer}>
        Changing the tempo moves only the grid, not the audio. In x/8 signatures a beat is an eighth
        note.
      </Text>
    </Screen>
  );
}

function StepButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: IconName;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.stepButton,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Icon name={icon} size={16} color="primary" />
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  content: { paddingTop: t.spacing.xl, paddingBottom: t.spacing.xl, gap: t.spacing.lg },
  inputRow: { paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.xs },
  input: { ...t.typography.body, color: t.colors.text, paddingVertical: t.spacing.sm },
  tempoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.md,
  },
  tempoLabel: { flex: 1 },
  bpmInput: {
    ...t.typography.title2,
    color: t.colors.text,
    minWidth: 64,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  tapRow: { padding: t.spacing.md },
  segmentRow: { padding: t.spacing.md },
  footer: { paddingHorizontal: t.spacing.lg },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: t.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.surfacePressed,
  },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
}));
