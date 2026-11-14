import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme';

import { SECTION_COLORS, type SectionColor } from './sections';

/** A row of the section palette's colors; the current one has a check mark. */
export function SectionSwatches({
  value,
  size = 28,
  onChange,
}: {
  value: SectionColor | null;
  size?: number;
  onChange: (color: SectionColor) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Section color">
      {SECTION_COLORS.map((color) => {
        const selected = color.key === value;
        return (
          <Pressable
            key={color.key}
            accessibilityRole="radio"
            accessibilityLabel={color.label}
            accessibilityState={{ selected }}
            hitSlop={4}
            onPress={() => onChange(color.key)}
            style={({ pressed }) => [
              styles.swatch,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: theme.colors[color.token],
              },
              selected && styles.selected,
              pressed && styles.pressed,
            ]}>
            {selected ? (
              <Icon
                name={{ ios: 'checkmark', android: 'check' }}
                size={size * 0.5}
                color="onSection"
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, flexWrap: 'wrap' },
  swatch: { alignItems: 'center', justifyContent: 'center' },
  selected: { borderWidth: 2, borderColor: t.colors.text },
  pressed: { opacity: 0.6 },
}));
