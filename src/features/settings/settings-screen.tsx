import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, View } from 'react-native';

import {
  Icon,
  ListRow,
  ListSection,
  Screen,
  SegmentedControl,
  Text,
  type IconName,
} from '@/components/ui';
import { recordingsSizeBytes } from '@/features/audio/take-files';
import { formatBytes } from '@/features/projects/ideas-list';
import { appInfo, runtimeLabels } from '@/lib/app-info';
import { makeStyles } from '@/theme';

import { useAppearanceStore, type AppearancePreference } from './appearance-store';
import {
  LATENCY_OFFSET_MAX_MS,
  LATENCY_OFFSET_MIN_MS,
  LATENCY_OFFSET_STEP_MS,
  PRE_ROLL_BARS_OPTIONS,
  PRE_ROLL_SECONDS_OPTIONS,
  useRecordingSettingsStore,
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

const preRollBarOptions = PRE_ROLL_BARS_OPTIONS.map((bars) => ({
  value: String(bars),
  label: bars === 1 ? '1 bar' : `${bars} bars`,
}));

export function SettingsScreen() {
  const styles = useStyles();
  const preference = useAppearanceStore((state) => state.preference);
  const setPreference = useAppearanceStore((state) => state.setPreference);
  const latencyOffsetMs = useRecordingSettingsStore((state) => state.latencyOffsetMs);
  const setLatencyOffsetMs = useRecordingSettingsStore((state) => state.setLatencyOffsetMs);
  const preRollSeconds = useRecordingSettingsStore((state) => state.preRollSeconds);
  const setPreRollSeconds = useRecordingSettingsStore((state) => state.setPreRollSeconds);
  const preRollBars = useRecordingSettingsStore((state) => state.preRollBars);
  const setPreRollBars = useRecordingSettingsStore((state) => state.setPreRollBars);
  // Recomputed whenever the tab is shown, since ideas change elsewhere.
  const storage = useQuery({
    queryKey: ['storage', 'recordings'],
    queryFn: () => recordingsSizeBytes(),
  });
  const refetchStorage = storage.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchStorage();
    }, [refetchStorage]),
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

      <ListSection
        title="Recording"
        footer="Lines up takes recorded over other tracks, on top of the latency your device reports. If new takes sound late, increase it; early, decrease it.">
        <ListRow
          title="Latency offset"
          accessory={
            <View style={styles.stepper}>
              <StepButton
                label="Decrease latency offset"
                icon={{ ios: 'minus', android: 'remove' }}
                disabled={latencyOffsetMs <= LATENCY_OFFSET_MIN_MS}
                onPress={() => setLatencyOffsetMs(latencyOffsetMs - LATENCY_OFFSET_STEP_MS)}
              />
              <Text
                color="textSecondary"
                style={styles.stepperValue}
                accessibilityLabel={`Latency offset ${latencyOffsetMs} milliseconds`}>
                {`${latencyOffsetMs} ms`}
              </Text>
              <StepButton
                label="Increase latency offset"
                icon={{ ios: 'plus', android: 'add' }}
                disabled={latencyOffsetMs >= LATENCY_OFFSET_MAX_MS}
                onPress={() => setLatencyOffsetMs(latencyOffsetMs + LATENCY_OFFSET_STEP_MS)}
              />
            </View>
          }
        />
      </ListSection>

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

      <ListSection title="Storage" footer="Audio files of all your ideas, on this device.">
        <ListRow
          title="Recordings"
          value={storage.data != null ? formatBytes(storage.data) : '—'}
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
