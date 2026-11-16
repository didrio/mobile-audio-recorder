import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { makeStyles, useTheme, type ColorName } from '@/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';

export type ButtonVariant = 'primary' | 'secondary' | 'plain' | 'destructive';

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  title: string;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  /** Light haptic tick on press. Defaults to true. */
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
};

const foreground: Record<ButtonVariant, ColorName> = {
  primary: 'onPrimary',
  destructive: 'danger',
  secondary: 'primary',
  plain: 'primary',
};

export function Button({
  title,
  variant = 'primary',
  icon,
  loading = false,
  haptic = true,
  disabled,
  onPress,
  style,
  ...rest
}: ButtonProps) {
  const styles = useStyles();
  const theme = useTheme();
  const isDisabled = Boolean(disabled) || loading;
  const color = foreground[variant];

  const handlePress = (event: GestureResponderEvent) => {
    if (haptic) void Haptics.selectionAsync();
    onPress?.(event);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={theme.colors[color]} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={color} /> : null}
          <Text variant="headline" color={color}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  base: {
    minHeight: 50,
    paddingHorizontal: t.spacing.xl,
    borderRadius: t.radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.sm,
  },
  primary: { backgroundColor: t.colors.primary },
  // Red text on the neutral fill: the brand color is red too, so a solid red button would read as
  // the screen's main action.
  destructive: { backgroundColor: t.colors.surfacePressed },
  secondary: { backgroundColor: t.colors.surfacePressed },
  plain: { backgroundColor: 'transparent', minHeight: 44, paddingHorizontal: t.spacing.md },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
}));
