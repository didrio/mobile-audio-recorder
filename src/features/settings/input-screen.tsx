import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Icon, ListRow, ListSection, Screen, SegmentedControl, Text } from '@/components/ui';
import { prepareAudioSession } from '@/features/audio/audio-engine';
import {
  currentInput,
  deviceKey,
  inputChannel,
  inputName,
  pickableInputs,
  resolvePreferredInput,
} from '@/features/audio/audio-route';
import { refreshAudioRoute, useAudioRouteStore } from '@/features/audio/audio-route-store';
import { VolumeSlider, type SliderScale } from '@/features/timeline/volume-slider';
import { setInputGain } from '@/lib/audio-input';
import { makeStyles } from '@/theme';

import { useInputDevicesStore } from './input-devices-store';
import { useRecordingSettingsStore } from './recording-settings-store';

/** Input gain as the hardware takes it: 0–1, linear, shown in percent. */
const GAIN_SCALE: SliderScale = {
  toPosition: (gain) => gain,
  fromPosition: (position) => Math.round(position * 100) / 100,
  step: (gain, steps) => Math.min(1, Math.max(0, Math.round((gain + steps * 0.05) * 100) / 100)),
  format: (gain) => `${Math.round(gain * 100)}%`,
};

/** At most this many channels are offered (Input 1…8); interfaces with more are rare on a phone. */
const MAX_CHANNEL_CHOICES = 8;

/**
 * Settings → Recording → Input (T38): which input records (or Automatic), which channel of a
 * multi-channel input the take keeps, and the input gain where the hardware allows it.
 */
export function InputScreen() {
  const styles = useStyles();
  const devices = useAudioRouteStore((state) => state.devices);
  const inputInfo = useAudioRouteStore((state) => state.inputInfo);
  const preferredInput = useInputDevicesStore((state) => state.preferredInput);
  const setPreferredInput = useInputDevicesStore((state) => state.setPreferredInput);
  const channelByDevice = useInputDevicesStore((state) => state.channelByDevice);
  const setChannel = useInputDevicesStore((state) => state.setChannel);
  const setGain = useInputDevicesStore((state) => state.setGain);
  const bluetoothPhoneMic = useRecordingSettingsStore((state) => state.bluetoothPhoneMic);
  // The gain while its slider is dragged (applied on release).
  const [draggedGain, setDraggedGain] = useState<number | null>(null);

  // iOS lists inputs only for a session that can record: activate it while this screen shows.
  useFocusEffect(
    useCallback(() => {
      void prepareAudioSession()
        .catch(() => {})
        .then(refreshAudioRoute);
    }, []),
  );

  const inputs = pickableInputs(devices.availableInputs, bluetoothPhoneMic);
  const active = currentInput(devices);
  const picked = resolvePreferredInput(devices.availableInputs, preferredInput);
  const missing = preferredInput && !picked ? preferredInput : null;
  const channelCount = Math.min(MAX_CHANNEL_CHOICES, inputInfo.channelCount);
  const channel = active ? inputChannel(channelByDevice[deviceKey(active)], channelCount) : 0;
  const channelOptions = Array.from({ length: channelCount }, (_, index) => ({
    value: String(index),
    label: `Input ${index + 1}`,
  }));
  const shownGain = draggedGain ?? inputInfo.gain;
  const check = (
    <View style={styles.check}>
      <Icon name={{ ios: 'checkmark', android: 'check' }} size={16} color="primary" />
    </View>
  );

  return (
    <Screen grouped>
      <ListSection
        title="Input"
        footer="Automatic lets the phone choose: headphones with a mic or an interface when one is plugged in. A picked input is remembered; while it's unplugged, Automatic records.">
        <ListRow
          title="Automatic"
          subtitle={!preferredInput && active ? inputName(active) : undefined}
          selected={!preferredInput}
          accessory={!preferredInput ? check : undefined}
          chevron={false}
          onPress={() => setPreferredInput(null)}
        />
        {inputs.map((device) => {
          const isPicked = picked?.id === device.id;
          return (
            <ListRow
              key={device.id}
              title={inputName(device)}
              subtitle={active?.id === device.id ? 'In use' : undefined}
              selected={isPicked}
              accessory={isPicked ? check : undefined}
              chevron={false}
              onPress={() => setPreferredInput(device)}
            />
          );
        })}
        {missing ? (
          <ListRow
            title={inputName(missing)}
            subtitle="Not connected"
            selected
            accessory={check}
            chevron={false}
            onPress={() => setPreferredInput(null)}
          />
        ) : null}
        {inputs.length === 0 && !missing ? (
          <ListRow title="No inputs found" subtitle="Check microphone access in the Settings app" />
        ) : null}
      </ListSection>

      {active && channelCount > 1 ? (
        <ListSection
          title="Channel"
          footer={`${inputName(active)} has ${channelCount} inputs. The take records the one picked here (takes are mono); remembered for this device.`}>
          <View style={styles.segmentRow}>
            <SegmentedControl
              accessibilityLabel="Input channel"
              options={channelOptions}
              value={String(channel)}
              onChange={(value) => setChannel(active, Number(value))}
            />
          </View>
        </ListSection>
      ) : null}

      {active && inputInfo.gainSettable ? (
        <ListSection
          title="Input gain"
          footer="Turn it down if the meter turns red while you play. Remembered for this input.">
          <View style={styles.gainRow}>
            <VolumeSlider
              label="Input gain"
              gain={shownGain}
              scale={GAIN_SCALE}
              onDrag={setDraggedGain}
              onRelease={(gain) => {
                setDraggedGain(null);
                setGain(active, gain);
                void setInputGain(gain).then((applied) => {
                  if (applied) {
                    useAudioRouteStore.setState({ inputInfo: { ...inputInfo, gain } });
                  }
                });
              }}
            />
            <Text variant="footnote" color="textSecondary" style={styles.gainValue}>
              {GAIN_SCALE.format(shownGain)}
            </Text>
          </View>
        </ListSection>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  segmentRow: { padding: t.spacing.md },
  check: { marginLeft: 'auto' },
  gainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.sm,
  },
  gainValue: { minWidth: 44, textAlign: 'right', fontVariant: ['tabular-nums'] },
}));
