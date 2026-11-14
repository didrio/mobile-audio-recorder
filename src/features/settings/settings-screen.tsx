import * as Haptics from 'expo-haptics';
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
import { appInfo, runtimeLabels } from '@/lib/app-info';
import { makeStyles } from '@/theme';

import { useAppearanceStore, type AppearancePreference } from './appearance-store';
import {
  LATENCY_OFFSET_MAX_MS,
  LATENCY_OFFSET_MIN_MS,
  LATENCY_OFFSET_STEP_MS,
  PRE_ROLL_SECONDS_OPTIONS,
  useRecordingSettingsStore,
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

export function SettingsScreen() {
  const styles = useStyles();
  const preference = useAppearanceStore((state) => state.preference);
  const setPreference = useAppearanceStore((state) => state.setPreference);
  const latencyOffsetMs = useRecordingSettingsStore((state) => state.latencyOffsetMs);
  const setLatencyOffsetMs = useRecordingSettingsStore((state) => state.setLatencyOffsetMs);
  const preRollSeconds = useRecordingSettingsStore((state) => state.preRollSeconds);
  const setPreRollSeconds = useRecordingSettingsStore((state) => state.setPreRollSeconds);
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
        footer="With pre-roll on (the button above an idea's timeline), Record starts playback this long before the playhead and recording kicks in at the playhead.">
        <View style={styles.segmentRow}>
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
  segmentRow: { padding: t.spacing.md },
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
