import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { ListSection, SegmentedControl, Text } from '@/components/ui';
import { countLabel } from '@/features/projects/folder-tree';
import { isAudioExportAvailable } from '@/lib/audio-export';
import { makeStyles } from '@/theme';

import type { ExportFormat } from './export-plan';
import { ExportFooter, ExportSheetLayout } from './export-progress';
import { exportIdeas } from './export-runner';
import { useExportSettingsStore } from './export-settings-store';
import { formatOptions, ToggleRow } from './export-sheet';
import { useExportRun } from './use-export-run';

/**
 * Batch export (T37), from select mode in the Ideas list: the whole mix of each picked idea (ideas
 * in picked folders included), as the mixer sets it, into one zip. Shares the format, Normalize and
 * "Add BPM to name" choices with the single export.
 */
export function BatchExportSheet() {
  const styles = useStyles();
  const params = useLocalSearchParams<{ ids?: string }>();
  const ids = (params.ids ?? '').split(',').filter(Boolean);
  const settings = useExportSettingsStore();
  const { status, start, cancel, busy } = useExportRun();
  const format: ExportFormat = isAudioExportAvailable ? settings.format : 'wav';

  const onExport = () => {
    void Haptics.selectionAsync();
    void start((run) =>
      exportIdeas(ids, { format, normalize: settings.normalize, addBpm: settings.addBpm }, run),
    );
  };

  return (
    <ExportSheetLayout
      footer={
        <ExportFooter
          status={status}
          summary={
            ids.length > 1 ? `One zip with ${countLabel(ids.length, 'idea')}` : 'One audio file'
          }
          disabled={ids.length === 0}
          onExport={onExport}
          onCancel={cancel}
        />
      }>
      <Text variant="headline" accessibilityRole="header" align="center">
        Export {countLabel(ids.length, 'idea')}
      </Text>

      <View style={[styles.options, busy && styles.busy]} pointerEvents={busy ? 'none' : 'auto'}>
        <ListSection title="Format">
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
          footer="Each idea's whole mix, as its mixer sets it. Ideas without audio are skipped.">
          <ToggleRow
            title="Normalize"
            value={settings.normalize}
            onChange={(normalize) => settings.set({ normalize })}
          />
          <ToggleRow
            title="Add BPM to name"
            value={settings.addBpm}
            onChange={(addBpm) => settings.set({ addBpm })}
          />
        </ListSection>
      </View>
    </ExportSheetLayout>
  );
}

const useStyles = makeStyles((t) => ({
  options: { gap: t.spacing.lg },
  busy: { opacity: 0.5 },
  segment: { padding: t.spacing.md },
}));
