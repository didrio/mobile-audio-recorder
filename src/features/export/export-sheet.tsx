import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';

import { Icon, ListSection, Screen, SegmentedControl, Text } from '@/components/ui';
import { formatTimecode } from '@/features/audio/format-time';
import { useEditorStore } from '@/features/project/editor-store';
import { getProject, type Project } from '@/features/projects/projects-repo';
import { isAudioExportAvailable } from '@/lib/audio-export';
import { makeStyles, useTheme } from '@/theme';

import {
  exportSampleRate,
  lastClipEnd,
  planExport,
  resolveRange,
  wouldClip,
  type ExportFormat,
  type ExportKind,
  type ExportOptions,
  type ExportPlan,
  type RangeChoice,
  type Delivery,
} from './export-plan';
import { ExportFooter, ExportSheetLayout } from './export-progress';
import { exportIdea, measurePeak } from './export-runner';
import { useExportSettingsStore } from './export-settings-store';
import { useExportRun } from './use-export-run';

const kindOptions: { value: ExportKind; label: string }[] = [
  { value: 'mix', label: 'Mix' },
  { value: 'stems', label: 'Stems' },
];

export const formatOptions: { value: ExportFormat; label: string }[] = [
  { value: 'm4a', label: 'M4A' },
  { value: 'wav', label: 'WAV' },
];

const deliveryOptions: { value: Delivery; label: string }[] = [
  { value: 'zip', label: 'One zip' },
  { value: 'files', label: 'Separate files' },
];

/** Waits this long after the last option change before checking whether the mix would clip. */
const MEASURE_DELAY_MS = 300;

/**
 * Export (T36, T37), a sheet opened from the idea's "⋯" menu or its row in the Ideas list. Mix: one
 * file of what Play sounds like. Stems: one file per track, all the same length from the range
 * start, plus optional extras (click track, the mix, a MIDI tempo map; `info.txt` always), as one
 * zip or separate files. Rendered offline and shared with the system share sheet.
 */
export function ExportSheet() {
  const styles = useStyles();
  const params = useLocalSearchParams<{ id: string }>();
  const project = useExportProject(params.id);
  if (project === undefined) return null;
  if (project === null) {
    return (
      <Screen grouped contentContainerStyle={styles.content}>
        <Text align="center" color="textSecondary">
          This idea no longer exists.
        </Text>
      </Screen>
    );
  }
  return <ExportForm project={project} />;
}

/**
 * The idea: from the editor when it's the open one (latest edits; the editor keeps the loop region
 * apart from the loaded project), otherwise from the database.
 */
function useExportProject(id: string): Project | null | undefined {
  const open = useEditorStore((state) => (state.projectId === id ? state.project : null));
  const loopRegion = useEditorStore((state) => state.loopRegion);
  const stored = useQuery({
    queryKey: ['export-project', id],
    queryFn: () => getProject(id),
    enabled: !open,
    gcTime: 0,
  });
  return open ? { ...open, loopRegion } : stored.data;
}

function ExportForm({ project }: { project: Project }) {
  const styles = useStyles();
  const settings = useExportSettingsStore();
  const [range, setRange] = useState<RangeChoice>({ kind: 'whole' });
  const [includeClick, setIncludeClick] = useState(false);
  const { status, start, cancel, busy } = useExportRun();

  const format: ExportFormat = isAudioExportAvailable ? settings.format : 'wav';
  const options: ExportOptions = {
    kind: settings.kind,
    range,
    format,
    normalize: settings.normalize,
    includeClick,
    addBpm: settings.addBpm,
    applyTrackVolume: settings.applyTrackVolume,
    includeMuted: settings.includeMuted,
    clickStem: settings.clickStem,
    includeMix: settings.includeMix,
    midi: settings.midi,
    delivery: settings.delivery,
  };
  const plan = planExport(project, options);
  const peak = useClipCheck(project, options);
  const stems = settings.kind === 'stems';
  const sampleRate = exportSampleRate(project);

  const onExport = () => {
    void Haptics.selectionAsync();
    void start((run) => exportIdea(project, options, run));
  };

  return (
    <ExportSheetLayout
      footer={
        <ExportFooter
          status={status}
          summary={summaryOf(plan)}
          disabled={!plan}
          onExport={onExport}
          onCancel={cancel}
        />
      }>
      <View style={styles.title}>
        <Text variant="headline" accessibilityRole="header" align="center">
          Export
        </Text>
        <Text variant="footnote" color="textSecondary" align="center" numberOfLines={1}>
          {project.name}
        </Text>
      </View>

      <View style={[styles.options, busy && styles.busy]} pointerEvents={busy ? 'none' : 'auto'}>
        <View style={styles.segment}>
          <SegmentedControl
            accessibilityLabel="Export as"
            options={kindOptions}
            value={settings.kind}
            onChange={(kind) => settings.set({ kind })}
          />
          <Text variant="footnote" color="textSecondary" align="center">
            {stems ? 'One file per track, to mix elsewhere.' : 'One file of the whole idea.'}
          </Text>
        </View>

        <RangeSection project={project} value={range} onChange={setRange} />

        <ListSection
          title="Format"
          footer={
            isAudioExportAvailable
              ? `M4A is small, for sending. WAV is lossless: 24-bit, ${sampleRate / 1000} kHz.`
              : 'M4A needs the latest app build; WAV is lossless (24-bit).'
          }>
          <View style={styles.segment}>
            <SegmentedControl
              accessibilityLabel="Format"
              options={
                isAudioExportAvailable
                  ? formatOptions
                  : formatOptions.filter((o) => o.value === 'wav')
              }
              value={format}
              onChange={(value) => settings.set({ format: value })}
            />
          </View>
        </ListSection>

        <ListSection
          title="Options"
          footer={
            stems
              ? 'Normalize turns every file up or down by the same amount, so the loudest peaks at −1 dB and the balance stays.'
              : 'Normalize sets the loudest peak to −1 dB, so the file never clips.'
          }>
          <ToggleRow
            title="Normalize"
            value={settings.normalize}
            onChange={(normalize) => settings.set({ normalize })}
          />
          {stems ? (
            <ToggleRow
              title="Apply track volume"
              value={settings.applyTrackVolume}
              onChange={(applyTrackVolume) => settings.set({ applyTrackVolume })}
            />
          ) : null}
          {stems ? (
            <ToggleRow
              title="Include muted tracks"
              value={settings.includeMuted}
              onChange={(includeMuted) => settings.set({ includeMuted })}
            />
          ) : (
            <ToggleRow title="Include click" value={includeClick} onChange={setIncludeClick} />
          )}
          <ToggleRow
            title="Add BPM to name"
            value={settings.addBpm}
            onChange={(addBpm) => settings.set({ addBpm })}
          />
        </ListSection>

        {stems ? (
          <ListSection
            title="Extras"
            footer="Tempo & markers is a MIDI file with the tempo, time signature and sections, for Logic, Ableton and others. An info.txt with the details and notes is always included.">
            <ToggleRow
              title="Click track"
              value={settings.clickStem}
              onChange={(clickStem) => settings.set({ clickStem })}
            />
            <ToggleRow
              title="The mix"
              value={settings.includeMix}
              onChange={(includeMix) => settings.set({ includeMix })}
            />
            <ToggleRow
              title="Tempo & markers (MIDI)"
              value={settings.midi}
              onChange={(midi) => settings.set({ midi })}
            />
          </ListSection>
        ) : null}

        {stems ? (
          <ListSection title="Deliver as">
            <View style={styles.segment}>
              <SegmentedControl
                accessibilityLabel="Deliver as"
                options={deliveryOptions}
                value={settings.delivery}
                onChange={(delivery) => settings.set({ delivery })}
              />
            </View>
          </ListSection>
        ) : null}

        {!settings.normalize && peak != null && wouldClip(peak) ? (
          <View style={styles.warning} accessible accessibilityRole="alert">
            <Icon
              name={{ ios: 'exclamationmark.triangle.fill', android: 'warning' }}
              size={16}
              color="warning"
            />
            <Text variant="footnote" color="warning" style={styles.warningText}>
              {stems ? 'A file' : 'The mix'} would clip (peaks at +
              {(20 * Math.log10(peak)).toFixed(1)} dB). Turn on Normalize or lower the volume.
            </Text>
          </View>
        ) : null}
      </View>
    </ExportSheetLayout>
  );
}

/** What Export will make, under the button. */
function summaryOf(plan: ExportPlan | null): string {
  if (!plan) return 'There’s no audio to export in this range.';
  const count = plan.jobs.length + (plan.midiName ? 1 : 0) + (plan.infoName ? 1 : 0);
  if (plan.zipName) return `${plan.zipName} · ${count} files`;
  if (count > 1) return `${count} files`;
  return plan.jobs[0]?.fileName ?? '';
}

/**
 * The loudest peak the export would have, measured (rendered) once the options settle while
 * Normalize is off; `null` until known.
 */
function useClipCheck(project: Project, options: ExportOptions): number | null {
  const [result, setResult] = useState<{ key: string; peak: number } | null>(null);
  const { kind, range, normalize, includeClick, applyTrackVolume, includeMuted } = options;
  const { clickStem, includeMix } = options;
  const key = JSON.stringify([
    project.id,
    project.updatedAt,
    kind,
    range,
    includeClick,
    applyTrackVolume,
    includeMuted,
    clickStem,
    includeMix,
  ]);

  useEffect(() => {
    if (normalize) return;
    const token = { cancelled: false };
    const timer = setTimeout(() => {
      const measured: ExportOptions = {
        kind,
        range,
        normalize: false,
        includeClick,
        applyTrackVolume,
        includeMuted,
        clickStem,
        includeMix,
        format: 'wav',
        addBpm: false,
        midi: false,
        delivery: 'files',
      };
      measurePeak(project, measured, { token })
        .then((peak) => {
          if (!token.cancelled) setResult({ key, peak });
        })
        .catch(() => {});
    }, MEASURE_DELAY_MS);
    return () => {
      token.cancelled = true;
      clearTimeout(timer);
    };
  }, [
    key,
    normalize,
    project,
    kind,
    range,
    includeClick,
    applyTrackVolume,
    includeMuted,
    clickStem,
    includeMix,
  ]);

  return result?.key === key ? result.peak : null;
}

function RangeSection({
  project,
  value,
  onChange,
}: {
  project: Project;
  value: RangeChoice;
  onChange: (choice: RangeChoice) => void;
}) {
  const whole = lastClipEnd(project.tracks);
  const loop = resolveRange(project, { kind: 'loop' }, project.tracks);
  const span = (start: number, end: number) => `${formatTimecode(start)} – ${formatTimecode(end)}`;
  return (
    <ListSection title="Range">
      <ChoiceRow
        title="Whole idea"
        detail={formatTimecode(whole)}
        selected={value.kind === 'whole'}
        onPress={() => onChange({ kind: 'whole' })}
      />
      {loop ? (
        <ChoiceRow
          title="Loop region"
          detail={span(loop.start, loop.end)}
          selected={value.kind === 'loop'}
          onPress={() => onChange({ kind: 'loop' })}
        />
      ) : null}
      {project.sections.map((section) => (
        <ChoiceRow
          key={section.id}
          title={section.name}
          detail={span(section.start, section.start + section.duration)}
          selected={value.kind === 'section' && value.id === section.id}
          onPress={() => onChange({ kind: 'section', id: section.id })}
        />
      ))}
    </ListSection>
  );
}

/** One choice of a single-choice list: a checkmark on the picked one. */
function ChoiceRow({
  title,
  detail,
  selected,
  onPress,
}: {
  title: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${detail}`}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [styles.choice, pressed && styles.pressed]}>
      <Text style={styles.choiceTitle} numberOfLines={1}>
        {title}
      </Text>
      <Text variant="footnote" color="textSecondary" style={styles.tabular}>
        {detail}
      </Text>
      <View style={styles.check}>
        {selected ? (
          <Icon name={{ ios: 'checkmark', android: 'check' }} size={16} color="primary" />
        ) : null}
      </View>
    </Pressable>
  );
}

/** A labelled switch row (the label takes the row, the switch sits at the end). */
export function ToggleRow({
  title,
  value,
  onChange,
}: {
  title: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.choice}>
      <Text style={styles.choiceTitle} numberOfLines={1}>
        {title}
      </Text>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.colors.primary }}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  content: { paddingTop: t.spacing.xl, paddingBottom: t.spacing.xl, gap: t.spacing.lg },
  title: { gap: t.spacing.xs, paddingHorizontal: t.spacing.lg },
  options: { gap: t.spacing.lg },
  busy: { opacity: 0.5 },
  segment: { padding: t.spacing.md, gap: t.spacing.sm },
  choice: {
    minHeight: 48,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
  },
  choiceTitle: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  check: { width: 18, alignItems: 'center' },
  pressed: { backgroundColor: t.colors.surfacePressed },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.spacing.sm,
    paddingHorizontal: t.spacing.lg,
  },
  warningText: { flex: 1 },
}));
