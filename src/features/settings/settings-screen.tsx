import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Switch, View } from 'react-native';

import { ListRow, ListSection, Screen, SegmentedControl, Text } from '@/components/ui';
import { recordingsSizeBytes } from '@/features/audio/take-files';
import { formatBytes } from '@/features/projects/ideas-list';
import { deletedRecordingsBytes } from '@/features/projects/trash-repo';
import { formatDb } from '@/features/timeline/fader-math';
import { VolumeSlider } from '@/features/timeline/volume-slider';
import { appInfo, runtimeLabels } from '@/lib/app-info';
import { isEchoCancellerAvailable } from '@/lib/echo-canceller';
import { makeStyles, useTheme } from '@/theme';

import { useAppearanceStore, type AppearancePreference } from './appearance-store';
import { useExperimentalSettingsStore } from './experimental-settings-store';
import { useKeyboardSettingsStore } from './keyboard-settings-store';
import {
  BluetoothSection,
  HearYourselfSection,
  InputRow,
  LatencySection,
  OutputRow,
  SilentRecordingSection,
} from './recording-settings-rows';
import {
  PRE_ROLL_BARS_OPTIONS,
  PRE_ROLL_SECONDS_OPTIONS,
  RECORDING_BIT_DEPTHS,
  useRecordingSettingsStore,
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

const preRollBarOptions = PRE_ROLL_BARS_OPTIONS.map((bars) => ({
  value: String(bars),
  label: bars === 1 ? '1 bar' : `${bars} bars`,
}));

export function SettingsScreen() {
  const styles = useStyles();
  const preference = useAppearanceStore((state) => state.preference);
  const setPreference = useAppearanceStore((state) => state.setPreference);
  const router = useRouter();
  const bitDepth = useRecordingSettingsStore((state) => state.bitDepth);
  const setBitDepth = useRecordingSettingsStore((state) => state.setBitDepth);
  const theme = useTheme();
  const preRollSeconds = useRecordingSettingsStore((state) => state.preRollSeconds);
  const setPreRollSeconds = useRecordingSettingsStore((state) => state.setPreRollSeconds);
  const preRollBars = useRecordingSettingsStore((state) => state.preRollBars);
  const setPreRollBars = useRecordingSettingsStore((state) => state.setPreRollBars);
  const verticalTimeline = useExperimentalSettingsStore((state) => state.verticalTimeline);
  const setVerticalTimeline = useExperimentalSettingsStore((state) => state.setVerticalTimeline);
  const speakerMode = useExperimentalSettingsStore((state) => state.speakerMode);
  const setSpeakerMode = useExperimentalSettingsStore((state) => state.setSpeakerMode);
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
        <InputRow onPress={() => router.push('/settings/input')} />
        <OutputRow />
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

      <HearYourselfSection />
      <BluetoothSection />
      <LatencySection />
      <SilentRecordingSection />

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

      <ListSection
        title="Experimental"
        footer="Turns an idea's timeline on its side: time runs down the screen and tracks sit side by side. Still being tried out, so it may change.">
        <ListRow
          title="Vertical timeline"
          accessory={
            <Switch
              accessibilityLabel="Vertical timeline"
              value={verticalTimeline}
              onValueChange={setVerticalTimeline}
              trackColor={{ true: theme.colors.primary }}
            />
          }
        />
      </ListSection>
      {isEchoCancellerAvailable ? (
        <ListSection footer="Record without headphones: after you stop, the song and the click that came from the speaker are removed from the new take. The original recording is kept. Headphones still give the cleanest takes.">
          <ListRow
            title="Speaker mode"
            accessory={
              <Switch
                accessibilityLabel="Speaker mode"
                value={speakerMode}
                onValueChange={setSpeakerMode}
                trackColor={{ true: theme.colors.primary }}
              />
            }
          />
        </ListSection>
      ) : null}

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

const useStyles = makeStyles((t) => ({
  segmentRow: { padding: t.spacing.md, gap: t.spacing.xs },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.sm,
  },
  volumeValue: { minWidth: 60, textAlign: 'right', fontVariant: ['tabular-nums'] },
}));
