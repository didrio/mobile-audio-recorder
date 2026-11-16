import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Screen, Text } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme';

import type { ExportRunStatus } from './use-export-run';

/**
 * An export sheet's layout: the options scroll, and `ExportFooter` stays pinned under them so Export
 * is always in reach.
 *
 * The footer comes first in the tree (and `column-reverse` puts it at the bottom) on purpose: in a
 * form sheet react-native-screens resizes the scroll view it finds down the first-child chain to
 * cover the whole sheet (`applyFrameCorrectionForDescendantScrollView`), which would put the options
 * under the footer, or nowhere. Not first, the scroll view is left to its laid-out size.
 */
export function ExportSheetLayout({
  footer,
  children,
}: {
  footer: ReactNode;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.root} collapsable={false}>
      {footer}
      <Screen grouped contentContainerStyle={styles.content}>
        {children}
      </Screen>
    </View>
  );
}

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
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bar = [styles.footer, { paddingBottom: Math.max(insets.bottom, theme.spacing.lg) }];

  if (status.kind === 'running') {
    const { done, total, label } = status.progress;
    const fraction = total > 0 ? Math.min(1, done / total) : 0;
    return (
      <View style={bar}>
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
    <View style={bar}>
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
  root: {
    flex: 1,
    flexDirection: 'column-reverse',
    backgroundColor: t.colors.backgroundGrouped,
  },
  content: { paddingTop: t.spacing.xl, paddingBottom: t.spacing.xl, gap: t.spacing.lg },
  footer: {
    gap: t.spacing.sm,
    paddingTop: t.spacing.md,
    paddingHorizontal: t.spacing.xl,
    backgroundColor: t.colors.backgroundGrouped,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
  },
  track: {
    height: 6,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfacePressed,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: t.radius.full, backgroundColor: t.colors.primary },
}));
