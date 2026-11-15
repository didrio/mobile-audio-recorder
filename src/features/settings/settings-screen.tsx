import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';

import {
  Icon,
  ListRow,
  ListSection,
  Screen,
  SegmentedControl,
  Text,
  type IconName,
} from '@/components/ui';
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
import { recordingsSizeBytes } from '@/features/audio/take-files';
import { formatBytes } from '@/features/projects/ideas-list';
import { deletedRecordingsBytes } from '@/features/projects/trash-repo';
import { formatDb } from '@/features/timeline/fader-math';
import { VolumeSlider } from '@/features/timeline/volume-slider';
import { appInfo, runtimeLabels } from '@/lib/app-info';
import { SPEAKER_MODE_ENABLED, isEchoCancellerAvailable } from '@/lib/echo-canceller';
import { makeStyles, useTheme } from '@/theme';

import { useAppearanceStore, type AppearancePreference } from './appearance-store';
import { useInputDevicesStore } from './input-devices-store';
import { useKeyboardSettingsStore } from './keyboard-settings-store';
import {
  LATENCY_OFFSET_MAX_MS,
  LATENCY_OFFSET_MIN_MS,
  LATENCY_OFFSET_STEP_MS,
  PRE_ROLL_BARS_OPTIONS,
  PRE_ROLL_SECONDS_OPTIONS,
  RECORDING_BIT_DEPTHS,
  useRecordingSettingsStore,
  type CleanupStrength,
  type RecordingBitDepth,
  type PreRollBars,
  type PreRollSeconds,
} from './recording-settings-store';

const appearanceOptions = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const satisfies readonly { value: AppearancePreference; label: string }[];

const preRollOptions = PRE_ROLL_SECONDS_OPTIONS.map((seconds) => ({
  value: String(seconds),
  label: `${seconds} s`,
}));

const bitDepthOptions = RECORDING_BIT_DEPTHS.map((bits) => ({
  value: String(bits),
  label: `${bits}-bit`,
}));

const cleanupOptions = [
  { value: 'light', label: 'Light' },
  { value: 'strong', label: 'Strong' },
] as const satisfies readonly { value: CleanupStrength; label: string }[];

const preRollBarOptions = PRE_ROLL_BARS_OPTIONS.map((bars) => ({
  value: String(bars),
  label: bars === 1 ? '1 bar' : `${bars} bars`,
}));

export function SettingsScreen() {
  const styles = useStyles();
  const preference = useAppearanceStore((state) => state.preference);
  const setPreference = useAppearanceStore((state) => state.setPreference);
  const router = useRouter();
  const latencyOffsetsMs = useRecordingSettingsStore((state) => state.latencyOffsetsMs);
  const setLatencyOffsetMs = useRecordingSettingsStore((state) => state.setLatencyOffsetMs);
  const bluetoothPhoneMic = useRecordingSettingsStore((state) => state.bluetoothPhoneMic);
  const setBluetoothPhoneMic = useRecordingSettingsStore((state) => state.setBluetoothPhoneMic);
  const bitDepth = useRecordingSettingsStore((state) => state.bitDepth);
  const setBitDepth = useRecordingSettingsStore((state) => state.setBitDepth);
  const routeState = useAudioRouteStore((state) => state);
  const preferredInput = useInputDevicesStore((state) => state.preferredInput);
  const channelByDevice = useInputDevicesStore((state) => state.channelByDevice);
  const route = currentOutputRoute(routeState);
  const input = currentInput(routeState.devices);
  const { channelCount } = routeState.inputInfo;
  // iOS reports the input only once the app has used audio; until then, name the remembered choice.
  const inputValue = input
    ? inputLabel(
        inputName(input),
        inputChannel(channelByDevice[deviceKey(input)], channelCount),
        channelCount,
      )
    : preferredInput
      ? inputName(preferredInput)
      : 'Automatic';
  const speakerMode = useRecordingSettingsStore((state) => state.speakerMode);
  const setSpeakerMode = useRecordingSettingsStore((state) => state.setSpeakerMode);
  const silentRecording = useRecordingSettingsStore((state) => state.silentRecording);
  const setSilentRecording = useRecordingSettingsStore((state) => state.setSilentRecording);
  const cleanupStrength = useRecordingSettingsStore((state) => state.cleanupStrength);
  const setCleanupStrength = useRecordingSettingsStore((state) => state.setCleanupStrength);
  const theme = useTheme();
  const preRollSeconds = useRecordingSettingsStore((state) => state.preRollSeconds);
  const setPreRollSeconds = useRecordingSettingsStore((state) => state.setPreRollSeconds);
  const preRollBars = useRecordingSettingsStore((state) => state.preRollBars);
  const monitoring = useRecordingSettingsStore((state) => state.monitoring);
  const setMonitoring = useRecordingSettingsStore((state) => state.setMonitoring);
  const monitorLevel = useRecordingSettingsStore((state) => state.monitorLevel);
  const setMonitorLevel = useRecordingSettingsStore((state) => state.setMonitorLevel);
  const [draggedMonitorLevel, setDraggedMonitorLevel] = useState<number | null>(null);
  const shownMonitorLevel = draggedMonitorLevel ?? monitorLevel;
  const monitor = useMonitorStatus();
  // Not offered on the speaker (feedback) or when the delay is too long to play along to.
  const monitorOffered = monitor.status === 'on' || monitor.status === 'off';
  const setPreRollBars = useRecordingSettingsStore((state) => state.setPreRollBars);
  const keyboardVolume = useKeyboardSettingsStore((state) => state.keyboardVolume);
  const setKeyboardVolume = useKeyboardSettingsStore((state) => state.setKeyboardVolume);
  // The volume while its slider is dragged (saved on release).
  const [draggedKeyboardVolume, setDraggedKeyboardVolume] = useState<number | null>(null);
  const shownKeyboardVolume = draggedKeyboardVolume ?? keyboardVolume;
  // Recomputed whenever the tab is shown, since ideas change elsewhere.
  const storage = useQuery({
    queryKey: ['storage', 'recordings'],
    queryFn: () => recordingsSizeBytes(),
  });
  const deletedStorage = useQuery({
    queryKey: ['storage', 'deleted'],
    queryFn: deletedRecordingsBytes,
  });
  const refetchStorage = storage.refetch;
  const refetchDeleted = deletedStorage.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchStorage();
      void refetchDeleted();
    }, [refetchStorage, refetchDeleted]),
  );
  const { updates } = appInfo;
  // OTA update details only mean something in release builds (dev builds load JS from the bundler).
  const showUpdates = updates.enabled && appInfo.runtime === 'release-build';

  return (
    <Screen grouped>
      <ListSection title="Appearance" footer="System follows your device's light/dark setting.">
        <View style={styles.segmentRow}>
          <SegmentedControl
            accessibilityLabel="Appearance"
            options={appearanceOptions}
            value={preference}
            onChange={setPreference}
          />
        </View>
      </ListSection>

      <ListSection title="Recording" footer="24-bit leaves more room before a loud take clips.">
        <ListRow title="Input" value={inputValue} onPress={() => router.push('/settings/input')} />
        <ListRow
          title="Output"
          accessory={
            <View style={styles.outputValue}>
              <Text color="textSecondary" numberOfLines={1} style={styles.outputName}>
                {outputLabel(currentOutput(routeState.devices))}
              </Text>
              <RoutePickerButton />
            </View>
          }
        />
        <View style={styles.segmentRow}>
          <Text variant="footnote" color="textSecondary">
            Bit depth
          </Text>
          <SegmentedControl
            accessibilityLabel="Bit depth"
            options={bitDepthOptions}
            value={String(bitDepth)}
            onChange={(value) => {
              const bits = RECORDING_BIT_DEPTHS.find((option) => String(option) === value);
              if (bits) setBitDepth(bits as RecordingBitDepth);
            }}
          />
        </View>
      </ListSection>

      <ListSection
        title="Hear yourself"
        footer={monitorNote(monitor.status, monitor.route, monitor.latency)}>
        <ListRow
          title="Hear yourself"
          subtitle="While a track is armed"
          accessory={
            <Switch
              accessibilityLabel="Hear yourself"
              value={monitoring && monitorOffered}
              disabled={!monitorOffered}
              accessibilityState={{
                disabled: !monitorOffered,
                checked: monitoring && monitorOffered,
              }}
              onValueChange={setMonitoring}
              trackColor={{ true: theme.colors.primary }}
            />
          }
        />
        {monitoring && monitorOffered ? (
          <View style={styles.volumeRow}>
            <Text>Level</Text>
            <VolumeSlider
              label="Hear yourself level"
              gain={shownMonitorLevel}
              onDrag={setDraggedMonitorLevel}
              onRelease={(level) => {
                setDraggedMonitorLevel(null);
                setMonitorLevel(level);
              }}
            />
            <Text variant="footnote" color="textSecondary" style={styles.volumeValue}>
              {formatDb(shownMonitorLevel)}
            </Text>
          </View>
        ) : null}
      </ListSection>

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

      {SPEAKER_MODE_ENABLED && isEchoCancellerAvailable ? (
        <ListSection
          title="Speaker mode"
          footer="Record without headphones: after you stop, the song and the click that came from the speaker are removed from the new take. The original recording is kept. Headphones still give the cleanest takes.">
          <ListRow
            title="Speaker mode (experimental)"
            accessory={
              <Switch
                accessibilityLabel="Speaker mode"
                value={speakerMode}
                onValueChange={setSpeakerMode}
                trackColor={{ true: theme.colors.primary }}
              />
            }
          />
          {speakerMode ? (
            <View style={styles.segmentRow}>
              <Text variant="footnote" color="textSecondary">
                Cleanup
              </Text>
              <SegmentedControl
                accessibilityLabel="Cleanup strength"
                options={cleanupOptions}
                value={cleanupStrength}
                onChange={setCleanupStrength}
              />
            </View>
          ) : null}
        </ListSection>
      ) : null}

      <ListSection
        title="Pre-roll"
        footer="With pre-roll on (the button above an idea's timeline), Record starts playback this long before the playhead and recording kicks in at the playhead. Ideas with the grid on use whole bars, so the punch lands on the beat.">
        <View style={styles.segmentRow}>
          <Text variant="footnote" color="textSecondary">
            Grid off
          </Text>
          <SegmentedControl
            accessibilityLabel="Pre-roll length"
            options={preRollOptions}
            value={String(preRollSeconds)}
            onChange={(value) => {
              const seconds = PRE_ROLL_SECONDS_OPTIONS.find((option) => String(option) === value);
              if (seconds) setPreRollSeconds(seconds as PreRollSeconds);
            }}
          />
        </View>
        <View style={styles.segmentRow}>
          <Text variant="footnote" color="textSecondary">
            Grid on
          </Text>
          <SegmentedControl
            accessibilityLabel="Pre-roll length with the grid on"
            options={preRollBarOptions}
            value={String(preRollBars)}
            onChange={(value) => {
              const bars = PRE_ROLL_BARS_OPTIONS.find((option) => String(option) === value);
              if (bars) setPreRollBars(bars as PreRollBars);
            }}
          />
        </View>
      </ListSection>

      <ListSection
        title="Pitch keyboard"
        footer="The keyboard button above an idea's timeline plays any note, to find a starting note or check a key. It's never recorded, except what the mic hears.">
        <View style={styles.volumeRow}>
          <Text>Volume</Text>
          <VolumeSlider
            label="Keyboard volume"
            gain={shownKeyboardVolume}
            onDrag={setDraggedKeyboardVolume}
            onRelease={(volume) => {
              setDraggedKeyboardVolume(null);
              setKeyboardVolume(volume);
            }}
          />
          <Text variant="footnote" color="textSecondary" style={styles.volumeValue}>
            {formatDb(shownKeyboardVolume)}
          </Text>
        </View>
      </ListSection>

      <ListSection
        title="Storage"
        footer="Audio files of your ideas, on this device. Recently Deleted ideas are deleted for good after 30 days.">
        <ListRow
          title="Recordings"
          value={
            storage.data != null && deletedStorage.data != null
              ? formatBytes(Math.max(0, storage.data - deletedStorage.data))
              : '—'
          }
        />
        <ListRow
          title="Recently Deleted"
          value={deletedStorage.data != null ? formatBytes(deletedStorage.data) : '—'}
        />
      </ListSection>

      <ListSection title="About">
        <ListRow
          title="Version"
          value={
            appInfo.buildNumber ? `${appInfo.version} (${appInfo.buildNumber})` : appInfo.version
          }
        />
        <ListRow title="Variant" value={appInfo.variant} />
        <ListRow title="Runtime" value={runtimeLabels[appInfo.runtime]} />
        {showUpdates ? <ListRow title="Update channel" value={updates.channel || '—'} /> : null}
        {showUpdates ? (
          <ListRow
            title="Update"
            value={updates.isEmbeddedLaunch ? 'Embedded bundle' : updates.updateId || '—'}
            selectable
          />
        ) : null}
      </ListSection>
    </Screen>
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
  segmentRow: { padding: t.spacing.md, gap: t.spacing.xs },
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
