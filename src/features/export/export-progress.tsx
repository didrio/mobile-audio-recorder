import { View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { makeStyles } from '@/theme';

import type { ExportRunStatus } from './use-export-run';

/**
 * The bottom of an export sheet: the Export button with what it makes underneath, the progress bar
 * with Cancel while it runs, or the error.
 */
export function ExportFooter({
  status,
  summary,
  disabled,
  onExport,
  onCancel,
}: {
  status: ExportRunStatus;
  /** What Export makes ("Song idea.m4a"), or why it can't. */
  summary: string;
  disabled: boolean;
  onExport: () => void;
  onCancel: () => void;
}) {
  const styles = useStyles();

  if (status.kind === 'running') {
    const { done, total, label } = status.progress;
    const fraction = total > 0 ? Math.min(1, done / total) : 0;
    return (
      <View style={styles.footer}>
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityLabel="Export progress"
          accessibilityValue={{ min: 0, max: total, now: done }}>
          <View style={[styles.fill, { width: `${Math.max(4, fraction * 100)}%` }]} />
        </View>
        <Text variant="footnote" color="textSecondary" align="center" numberOfLines={1}>
          {label}…
        </Text>
        <Button title="Cancel" variant="secondary" onPress={onCancel} />
      </View>
    );
  }

  return (
    <View style={styles.footer}>
      {status.kind === 'error' ? (
        <Text variant="footnote" color="danger" align="center">
          {status.message}
        </Text>
      ) : null}
      <Button
        title={status.kind === 'sharing' ? 'Sharing…' : 'Export'}
        icon={{ ios: 'square.and.arrow.up', android: 'ios_share' }}
        disabled={disabled || status.kind === 'sharing'}
        loading={status.kind === 'sharing'}
        onPress={onExport}
      />
      <Text variant="footnote" color="textSecondary" align="center">
        {summary}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  footer: { gap: t.spacing.md, paddingHorizontal: t.spacing.lg },
  track: {
    height: 6,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfacePressed,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: t.radius.full, backgroundColor: t.colors.primary },
}));
