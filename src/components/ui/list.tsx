import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { makeStyles } from '@/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';

export type ListSectionProps = {
  title?: string;
  footer?: string;
  children: ReactNode;
};

/** An inset grouped list section (iOS Settings style). Separators are added between rows. */
export function ListSection({ title, footer, children }: ListSectionProps) {
  const styles = useStyles();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={styles.section}>
      {title ? (
        <Text
          variant="footnote"
          color="textSecondary"
          accessibilityRole="header"
          style={[styles.sectionLabel, styles.sectionTitle]}>
          {title}
        </Text>
      ) : null}
      <View style={styles.sectionBody}>
        {rows.map((row, index) => (
          <Fragment key={row.key ?? index}>
            {index > 0 ? <View style={styles.separator} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <Text variant="footnote" color="textSecondary" style={styles.sectionLabel}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

export type ListRowProps = {
  title: string;
  /** A smaller line under the title (a date, a hint…). */
  subtitle?: string;
  /** Secondary text shown on the right (e.g. a current value). */
  value?: string | null;
  icon?: IconName;
  /** Makes the row pressable and shows a chevron. */
  onPress?: () => void;
  /** Long-press handler (e.g. open a context menu). Only used together with `onPress`. */
  onLongPress?: () => void;
  /** Custom trailing element (switch, badge…). Replaces `value`. */
  accessory?: ReactNode;
  /** Allow long-press to copy the value (useful for IDs). */
  selectable?: boolean;
  testID?: string;
};

export function ListRow({
  title,
  subtitle,
  value,
  icon,
  onPress,
  onLongPress,
  accessory,
  selectable,
  testID,
}: ListRowProps) {
  const styles = useStyles();
  const content = (
    <>
      {icon ? <Icon name={icon} size={20} color="primary" /> : null}
      {subtitle ? (
        <View style={styles.rowTexts}>
          <Text numberOfLines={1}>{title}</Text>
          <Text variant="footnote" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      ) : (
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
      )}
      {accessory ??
        (value != null ? (
          <Text
            color="textSecondary"
            style={styles.rowValue}
            numberOfLines={1}
            ellipsizeMode="middle"
            selectable={selectable}>
            {value}
          </Text>
        ) : null)}
      {onPress ? (
        <Icon
          name={{ ios: 'chevron.right', android: 'chevron_right' }}
          size={14}
          color="textTertiary"
        />
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.row} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onLongPress}
      testID={testID}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      {content}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  section: { gap: t.spacing.sm },
  sectionLabel: { paddingHorizontal: t.spacing.lg },
  sectionTitle: { textTransform: 'uppercase' },
  sectionBody: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  separator: {
    height: 1,
    marginLeft: t.spacing.lg,
    backgroundColor: t.colors.border,
    opacity: 0.6,
  },
  row: {
    minHeight: 48,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
  },
  rowPressed: { backgroundColor: t.colors.surfacePressed },
  rowTitle: { flexShrink: 0 },
  rowTexts: { flexShrink: 1 },
  rowValue: { flex: 1, textAlign: 'right' },
}));
