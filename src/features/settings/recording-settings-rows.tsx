import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';

import { Icon, ListRow, ListSection, Text, type IconName } from '@/components/ui';
import {
  currentInput,
  currentOutput,
  deviceKey,
  inputChannel,
  inputLabel,
  inputName,
  OUTPUT_ROUTE_LABELS,
  outputLabel,
} from '@/features/audio/audio-route';
import {
  currentOutputRoute,
  useAudioRouteStore,
  useMonitorStatus,
} from '@/features/audio/audio-route-store';
import { monitorNote } from '@/features/audio/monitoring';
import { RoutePickerButton } from '@/features/audio/route-picker-button';
import { formatDb } from '@/features/timeline/fader-math';
import { VolumeSlider } from '@/features/timeline/volume-slider';
import { makeStyles, useTheme } from '@/theme';

import { useInputDevicesStore } from './input-devices-store';
import {
  LATENCY_OFFSET_MAX_MS,
  LATENCY_OFFSET_MIN_MS,
  LATENCY_OFFSET_STEP_MS,
  useRecordingSettingsStore,
} from './recording-settings-store';

/*
 * App-wide recording settings, shared by the Settings tab and the Recording tab of the settings sheet
 * inside an idea (T44). Both read and write the same stores, so they always show the same values.
 */

/** Input row: the current input (or the remembered choice), opening the input picker. */
export function InputRow({ onPress }: { onPress: () => void }) {
  const devices = useAudioRouteStore((state) => state.devices);
  const { channelCount } = useAudioRouteStore((state) => state.inputInfo);
  const preferredInput = useInputDevicesStore((state) => state.preferredInput);
  const channelByDevice = useInputDevicesStore((state) => state.channelByDevice);
  const input = currentInput(devices);
  // iOS reports the input only once the app has used audio; until then, name the remembered choice.
  const value = input
    ? inputLabel(
        inputName(input),
        inputChannel(channelByDevice[deviceKey(input)], channelCount),
        channelCount,
      )
    : preferredInput
      ? inputName(preferredInput)
      : 'Automatic';
  return <ListRow title="Input" value={value} onPress={onPress} />;
}

/** Output row: where sound plays now, with the system route picker. */
export function OutputRow() {
  const styles = useStyles();
  const devices = useAudioRouteStore((state) => state.devices);
  return (
    <ListRow
      title="Output"
      accessory={
        <View style={styles.outputValue}>
          <Text color="textSecondary" numberOfLines={1} style={styles.outputName}>
            {outputLabel(currentOutput(devices))}
          </Text>
          <RoutePickerButton />
        </View>
      }
    />
  );
}

export function HearYourselfSection() {
  const styles = useStyles();
  const theme = useTheme();
  const monitoring = useRecordingSettingsStore((state) => state.monitoring);
  const setMonitoring = useRecordingSettingsStore((state) => state.setMonitoring);
  const monitorLevel = useRecordingSettingsStore((state) => state.monitorLevel);
  const setMonitorLevel = useRecordingSettingsStore((state) => state.setMonitorLevel);
  // The level while its slider is dragged (saved on release).
  const [draggedLevel, setDraggedLevel] = useState<number | null>(null);
  const shownLevel = draggedLevel ?? monitorLevel;
  const monitor = useMonitorStatus();
  // Not offered on the speaker (feedback) or when the delay is too long to play along to.
  const offered = monitor.status === 'on' || monitor.status === 'off';
  return (
    <ListSection
      title="Hear yourself"
      footer={monitorNote(monitor.status, monitor.route, monitor.latency)}>
      <ListRow
        title="Hear yourself"
        subtitle="While a track is armed"
        accessory={
          <Switch
            accessibilityLabel="Hear yourself"
            value={monitoring && offered}
            disabled={!offered}
            accessibilityState={{ disabled: !offered, checked: monitoring && offered }}
            onValueChange={setMonitoring}
            trackColor={{ true: theme.colors.primary }}
          />
        }
      />
      {monitoring && offered ? (
        <View style={styles.volumeRow}>
          <Text>Level</Text>
          <VolumeSlider
            label="Hear yourself level"
            gain={shownLevel}
            onDrag={setDraggedLevel}
            onRelease={(level) => {
              setDraggedLevel(null);
              setMonitorLevel(level);
            }}
          />
          <Text variant="footnote" color="textSecondary" style={styles.volumeValue}>
            {formatDb(shownLevel)}
          </Text>
        </View>
      ) : null}
    </ListSection>
  );
}

export function BluetoothSection() {
  const theme = useTheme();
  const bluetoothPhoneMic = useRecordingSettingsStore((state) => state.bluetoothPhoneMic);
  const setBluetoothPhoneMic = useRecordingSettingsStore((state) => state.setBluetoothPhoneMic);
  return (
    <ListSection
      title="Bluetooth"
      footer={
        bluetoothPhoneMic
          ? "Bluetooth headphones stay in high-quality sound while the phone's mic records."
          : "The headphones' mic records, but playback in them drops to call quality while it does."
      }>
      <ListRow
        title="Phone's mic with Bluetooth"
        accessory={
          <Switch
            accessibilityLabel="Use the phone's mic with Bluetooth headphones"
            value={bluetoothPhoneMic}
            onValueChange={setBluetoothPhoneMic}
            trackColor={{ true: theme.colors.primary }}
          />
        }
      />
    </ListSection>
  );
}

export function LatencySection() {
  const routeState = useAudioRouteStore((state) => state);
  const route = currentOutputRoute(routeState);
  const latencyOffsetsMs = useRecordingSettingsStore((state) => state.latencyOffsetsMs);
  const setLatencyOffsetMs = useRecordingSettingsStore((state) => state.setLatencyOffsetMs);
  return (
    <ListSection
      title="Latency"
      footer="Lines up takes recorded over other tracks, on top of the latency your device reports. Each output (speaker, wired, Bluetooth, USB) keeps its own: this one is for what's playing now. If new takes sound late, increase it; early, decrease it.">
      <LatencyRow
        title="Latency offset"
        subtitle={`For ${OUTPUT_ROUTE_LABELS[route]}`}
        name="Latency offset"
        value={latencyOffsetsMs[route]}
        onChange={(value) => setLatencyOffsetMs(route, value)}
      />
    </ListSection>
  );
}

export function SilentRecordingSection() {
  const theme = useTheme();
  const silentRecording = useRecordingSettingsStore((state) => state.silentRecording);
  const setSilentRecording = useRecordingSettingsStore((state) => state.setSilentRecording);
  return (
    <ListSection
      title="Silent recording"
      footer="Without headphones: everything plays up to where the take starts, then goes quiet, so nothing from the speaker gets into it. With the metronome on, the beat display keeps time.">
      <ListRow
        title="Silent while recording"
        accessory={
          <Switch
            accessibilityLabel="Silent while recording"
            value={silentRecording}
            onValueChange={setSilentRecording}
            trackColor={{ true: theme.colors.primary }}
          />
        }
      />
    </ListSection>
  );
}

/** A latency offset with − and + buttons, in `LATENCY_OFFSET_STEP_MS` steps. */
function LatencyRow({
  title,
  subtitle,
  name,
  value,
  onChange,
}: {
  title: string;
  subtitle?: string;
  /** Spoken name, e.g. "Latency offset" ("Decrease latency offset", "Latency offset 20 milliseconds"). */
  name: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const styles = useStyles();
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      accessory={
        <View style={styles.stepper}>
          <StepButton
            label={`Decrease ${name.toLowerCase()}`}
            icon={{ ios: 'minus', android: 'remove' }}
            disabled={value <= LATENCY_OFFSET_MIN_MS}
            onPress={() => onChange(value - LATENCY_OFFSET_STEP_MS)}
          />
          <Text
            color="textSecondary"
            style={styles.stepperValue}
            accessibilityLabel={`${name} ${value} milliseconds`}>
            {`${value} ms`}
          </Text>
          <StepButton
            label={`Increase ${name.toLowerCase()}`}
            icon={{ ios: 'plus', android: 'add' }}
            disabled={value >= LATENCY_OFFSET_MAX_MS}
            onPress={() => onChange(value + LATENCY_OFFSET_STEP_MS)}
          />
        </View>
      }
    />
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
  outputValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    marginLeft: 'auto',
    flexShrink: 1,
  },
  outputName: { flexShrink: 1 },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.sm,
  },
  volumeValue: { minWidth: 60, textAlign: 'right', fontVariant: ['tabular-nums'] },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, marginLeft: 'auto' },
  stepperValue: { minWidth: 56, textAlign: 'center', fontVariant: ['tabular-nums'] },
  stepButton: {
    width: 32,
    height: 32,
    borderRadius: t.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.surfacePressed,
  },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
}));
