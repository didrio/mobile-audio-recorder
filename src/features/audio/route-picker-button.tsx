import { requireNativeViewManager } from 'expo-modules-core';
import type { ComponentType } from 'react';
import { Platform, type ViewProps } from 'react-native';

import { isAudioInputAvailable } from '@/lib/audio-input';
import { makeStyles, useTheme } from '@/theme';

type NativeProps = ViewProps & { tintColor?: string; activeTintColor?: string };

const NativeRoutePicker: ComponentType<NativeProps> | null =
  Platform.OS === 'ios' && isAudioInputAvailable
    ? requireNativeViewManager<NativeProps>('AudioInput', 'RoutePickerView')
    : null;

/** Whether the system's output route button can be shown (iOS with the latest build). */
export const routePickerAvailable = NativeRoutePicker != null;

/**
 * The system's output route button (iOS `AVRoutePickerView`): opens the list of outputs (speaker,
 * AirPods, AirPlay…). Nothing on Android, where switching outputs is left to the system.
 */
export function RoutePickerButton() {
  const styles = useStyles();
  const theme = useTheme();
  if (!NativeRoutePicker) return null;
  return (
    <NativeRoutePicker
      style={styles.button}
      tintColor={theme.colors.primary}
      activeTintColor={theme.colors.primary}
      accessibilityLabel="Choose output"
    />
  );
}

const useStyles = makeStyles(() => ({
  button: { width: 32, height: 32 },
}));
