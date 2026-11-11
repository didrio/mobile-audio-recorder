import { ScrollView, type ScrollViewProps } from 'react-native';

import { makeStyles } from '@/theme';

export type ScreenProps = ScrollViewProps & {
  /** Use the grouped background (for settings-style screens built from `ListSection`s). */
  grouped?: boolean;
  /** Apply standard horizontal padding to the content. Defaults to true. */
  padded?: boolean;
};

/**
 * Standard scrollable screen container.
 *
 * Insets are handled natively: on iOS the scroll view adjusts for the header, tab bar and safe
 * areas (`contentInsetAdjustmentBehavior="automatic"`, which also makes large titles collapse);
 * on Android the native header and tab bar take their own space.
 * For full-bleed screens (maps, camera, media, canvases) build your own layout instead, and start it
 * below the native header with `useHeaderHeight()` from `expo-router/react-navigation`: on iOS 26+ the
 * header floats over the content.
 */
export function Screen({
  children,
  grouped = false,
  padded = true,
  style,
  contentContainerStyle,
  ...rest
}: ScreenProps) {
  const styles = useStyles();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={[styles.root, grouped && styles.grouped, style]}
      contentContainerStyle={[styles.content, padded && styles.padded, contentContainerStyle]}
      {...rest}>
      {children}
    </ScrollView>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.background },
  grouped: { backgroundColor: t.colors.backgroundGrouped },
  content: {
    width: '100%',
    maxWidth: t.maxContentWidth,
    alignSelf: 'center',
    gap: t.spacing.xl,
    paddingTop: t.spacing.lg,
    paddingBottom: t.spacing.xxxl,
  },
  padded: { paddingHorizontal: t.spacing.lg },
}));
