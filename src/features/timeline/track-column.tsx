import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Text } from '@/components/ui';
import type { Track } from '@/features/projects/projects-repo';
import { makeStyles } from '@/theme';

import { VolumeSlider } from './volume-slider';

const ARM_SIZE = 26;
const TOGGLE_SIZE = 30;

/** A volume slider being dragged: its live gain, shown before it's saved. */
export type FaderDraft = { trackId: string; gain: number };

/**
 * The pinned track-controls column left of the lanes, one cell per lane. Collapsed it's just the arm
 * buttons (the armed track is the one Record records onto). Expanded (the mixer) each cell adds Mute,
 * Solo and a volume slider to the right of the arm button, which stays where it was. It follows the
 * lanes' vertical scroll (`laneScroll`) but never scrolls with time.
 */
export function TrackColumn({
  tracks,
  top,
  width,
  armWidth,
  expanded,
  lane,
  laneScroll,
  armedTrackId,
  armDisabled,
  anySolo,
  draft,
  onArm,
  onToggleMute,
  onToggleSolo,
  onVolumeDrag,
  onVolumeRelease,
}: {
  tracks: Pick<Track, 'id' | 'name' | 'volume' | 'muted' | 'solo'>[];
  /** Where the lanes start (below the ruler). */
  top: number;
  width: number;
  /** Width of the arm button's area (the collapsed column). */
  armWidth: number;
  /** Show the mixer controls. */
  expanded: boolean;
  lane: number;
  laneScroll: SharedValue<number>;
  armedTrackId: string | null;
  /** While recording: arming can't change. */
  armDisabled: boolean;
  /** Some track is soloed, so tracks that aren't are silent. */
  anySolo: boolean;
  draft: FaderDraft | null;
  onArm: (trackId: string) => void;
  onToggleMute: (trackId: string) => void;
  onToggleSolo: (trackId: string) => void;
  onVolumeDrag: (trackId: string, gain: number) => void;
  onVolumeRelease: (trackId: string, gain: number) => void;
}) {
  const styles = useStyles();
  const scrolled = useAnimatedStyle(() => ({ transform: [{ translateY: -laneScroll.get() }] }));

  return (
    <View style={[styles.viewport, { top, width }]}>
      <Animated.View style={scrolled}>
        {tracks.map((track, index) => {
          const armed = track.id === armedTrackId;
          const silent = anySolo ? !track.solo : track.muted;
          return (
            <View
              key={track.id}
              style={[styles.cell, { height: lane }, index % 2 === 1 && styles.cellAlt]}>
              <View style={[styles.armArea, { width: armWidth }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Arm ${track.name}`}
                  accessibilityState={{ selected: armed, disabled: armDisabled }}
                  disabled={armDisabled}
                  hitSlop={8}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    onArm(track.id);
                  }}
                  style={[styles.arm, armed && styles.armed, armDisabled && styles.disabled]}>
                  {armed ? <View style={styles.armDot} /> : null}
                </Pressable>
              </View>
              {expanded ? (
                <View style={styles.mixer}>
                  <MixerToggle
                    label={`Mute ${track.name}`}
                    letter="M"
                    active={track.muted}
                    kind="mute"
                    onPress={() => onToggleMute(track.id)}
                  />
                  <MixerToggle
                    label={`Solo ${track.name}`}
                    letter="S"
                    active={track.solo}
                    kind="solo"
                    onPress={() => onToggleSolo(track.id)}
                  />
                  <VolumeSlider
                    label={`${track.name} volume`}
                    gain={draft?.trackId === track.id ? draft.gain : track.volume}
                    dimmed={silent}
                    onDrag={(gain) => onVolumeDrag(track.id, gain)}
                    onRelease={(gain) => onVolumeRelease(track.id, gain)}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
}

/** Mute (M) or Solo (S): a small square toggle, filled when on. */
function MixerToggle({
  label,
  letter,
  active,
  kind,
  onPress,
}: {
  label: string;
  letter: string;
  active: boolean;
  kind: 'mute' | 'solo';
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={4}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.toggle,
        active && (kind === 'mute' ? styles.muteOn : styles.soloOn),
        pressed && styles.pressed,
      ]}>
      <Text
        variant="footnote"
        color={active ? (kind === 'mute' ? 'onMute' : 'onSolo') : 'textSecondary'}
        style={styles.toggleText}>
        {letter}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  viewport: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    overflow: 'hidden',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: t.colors.border,
    backgroundColor: t.colors.background,
  },
  cell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
    backgroundColor: t.colors.background,
  },
  cellAlt: { backgroundColor: t.colors.laneAlt },
  armArea: { alignItems: 'center', justifyContent: 'center' },
  arm: {
    width: ARM_SIZE,
    height: ARM_SIZE,
    borderRadius: t.radius.full,
    borderWidth: 2,
    borderColor: t.colors.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  armed: { borderColor: t.colors.primary },
  armDot: {
    width: ARM_SIZE / 2,
    height: ARM_SIZE / 2,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.primary,
  },
  mixer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    paddingRight: t.spacing.md,
  },
  toggle: {
    width: TOGGLE_SIZE,
    height: TOGGLE_SIZE,
    borderRadius: t.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.surfacePressed,
  },
  toggleText: { fontWeight: '700' },
  muteOn: { backgroundColor: t.colors.mute },
  soloOn: { backgroundColor: t.colors.solo },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
}));
