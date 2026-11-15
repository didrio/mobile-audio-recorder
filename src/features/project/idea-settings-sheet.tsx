import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { setMetronome } from '@/features/audio/audio-engine';
import { clickVolume, type MetronomeOutput } from '@/features/audio/metronome';
import {
  addTap,
  BPM_MAX,
  BPM_MIN,
  bpmFromTaps,
  clampBpm,
  TIME_SIGNATURES,
  timeSignatureLabel,
} from '@/features/audio/tempo';
import {
  BluetoothSection,
  HearYourselfSection,
  InputRow,
  LatencySection,
  OutputRow,
  SilentRecordingSection,
} from '@/features/settings/recording-settings-rows';
import { formatDb } from '@/features/timeline/fader-math';
import { VolumeSlider } from '@/features/timeline/volume-slider';
import { makeStyles, useTheme } from '@/theme';

import { setIdeaSettings, useEditorStore } from './editor-store';
import { useSettingsSheetStore, type SettingsSheetTab } from './settings-sheet-store';

/** Tempo changes (steppers, tap tempo) are saved as one undo step once they stop for this long. */
const COMMIT_DELAY_MS = 700;

const signatureOptions = TIME_SIGNATURES.map(({ beatsPerBar, beatUnit }) => ({
  value: timeSignatureLabel(beatsPerBar, beatUnit),
  label: timeSignatureLabel(beatsPerBar, beatUnit),
}));

const tabOptions: { value: SettingsSheetTab; label: string }[] = [
  { value: 'idea', label: 'Idea' },
  { value: 'recording', label: 'Recording' },
];

const outputOptions: { value: MetronomeOutput; label: string }[] = [
  { value: 'sound', label: 'Sound' },
  { value: 'visual', label: 'Visual' },
  { value: 'both', label: 'Both' },
];

/**
 * The settings sheet over an open idea (T44), opened from the header's sliders button, with two tabs:
 * - Idea: this idea's settings (editor store): tempo (stepper, typed value or Tap tempo), time
 *   signature, the grid switch and the metronome's output (Sound / Visual / Both: clicks, the beat
 *   display, or both) and volume (hidden for Visual). Every change is one undo step from the idea's
 *   header (a volume drag is one step, heard live while it moves). Tempo changes made in quick
 *   succession become one step. Setting a different tempo turns the grid on (`setIdeaSettingsEdit`).
 *   The name is changed from the title menu (Rename).
 * - Recording: app-wide recording settings, the same ones (and stores) as the Settings tab.
 * The last tab is remembered while the app runs.
 */
export function IdeaSettingsSheet() {
  const styles = useStyles();
  const params = useLocalSearchParams<{ id: string }>();
  const open = useEditorStore((state) => state.projectId === params.id && state.project != null);
  const tab = useSettingsSheetStore((state) => state.tab);
  const setTab = useSettingsSheetStore((state) => state.setTab);
  if (!open) return null;
  return (
    <Screen grouped contentContainerStyle={styles.content}>
      <SegmentedControl
        accessibilityLabel="Settings for"
        options={tabOptions}
        value={tab}
        onChange={setTab}
      />
      {tab === 'idea' ? <IdeaSettingsForm /> : <RecordingSettings />}
    </Screen>
  );
}

/** App-wide recording settings, the ones you'd change while working on a song. */
function RecordingSettings() {
  const styles = useStyles();
  const router = useRouter();
  return (
    <>
      <Text variant="footnote" color="textSecondary" style={styles.footer}>
        These apply to all your ideas, and are also in the Settings tab.
      </Text>
      <HearYourselfSection />
      <ListSection title="Input & output">
        <InputRow onPress={() => router.push('/input-picker')} />
        <OutputRow />
      </ListSection>
      <SilentRecordingSection />
      <BluetoothSection />
      <LatencySection />
    </>
  );
}

function IdeaSettingsForm() {
  const styles = useStyles();
  const theme = useTheme();
  const project = useEditorStore((state) => state.project)!;

  const [bpm, setBpm] = useState(project.bpm);
  const [bpmText, setBpmText] = useState(String(project.bpm));
  const pendingBpm = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taps = useRef<number[]>([]);
  const metronomeOn = useEditorStore((state) => state.metronome);
  /** The metronome volume while its slider is dragged (saved on release). */
  const [dragVolume, setDragVolume] = useState<number | null>(null);
  const metronomeVolume = dragVolume ?? project.metronomeVolume;

  const previewVolume = (volume: number) => {
    setDragVolume(volume);
    // Hear it at once if clicks are playing; the transport sets the saved value again afterwards.
    if (metronomeOn) {
      setMetronome({ meter: project, volume: clickVolume(project.metronomeOutput, volume) });
    }
  };
  const saveVolume = (volume: number) => {
    setDragVolume(null);
    void setIdeaSettings({ metronomeVolume: volume });
  };

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

  const tapTempo = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    taps.current = addTap(taps.current, Date.now());
    const tapped = bpmFromTaps(taps.current);
    if (tapped != null) changeBpm(tapped);
  };

  const signature = timeSignatureLabel(project.beatsPerBar, project.beatUnit);

  return (
    <>
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

      <ListSection
        title="Metronome"
        footer="Visual shows the beats as big blocks above the timeline. Record without headphones and keep the click out of the take.">
        <View style={styles.segmentRow}>
          <SegmentedControl
            accessibilityLabel="Metronome output"
            options={outputOptions}
            value={project.metronomeOutput}
            onChange={(metronomeOutput) => void setIdeaSettings({ metronomeOutput })}
          />
        </View>
        {project.metronomeOutput !== 'visual' && (
          <View style={styles.volumeRow}>
            <Text>Volume</Text>
            <VolumeSlider
              label="Metronome volume"
              gain={metronomeVolume}
              onDrag={previewVolume}
              onRelease={saveVolume}
            />
            <Text variant="footnote" color="textSecondary" style={styles.volumeValue}>
              {formatDb(metronomeVolume)}
            </Text>
          </View>
        )}
      </ListSection>

      <Text variant="footnote" color="textSecondary" style={styles.footer}>
        Changing the tempo moves only the grid, not the audio. In x/8 signatures a beat is an eighth
        note.
      </Text>
    </>
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
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.sm,
  },
  volumeValue: { minWidth: 52, textAlign: 'right', fontVariant: ['tabular-nums'] },
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
