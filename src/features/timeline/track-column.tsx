import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Icon, Text } from '@/components/ui';
import type { Track } from '@/features/projects/projects-repo';
import { makeStyles } from '@/theme';

import { VolumeSlider } from './volume-slider';

const INFO_SIZE = 30;
const TOGGLE_SIZE = 30;

/** A volume slider being dragged: its live gain, shown before it's saved. */
export type FaderDraft = { trackId: string; gain: number };

/**
 * The pinned track-controls column left of the lanes, one cell per lane. Collapsed, each cell is just a
 * track's grab handle (a faint grip glyph; T23 adds the long-press reorder). Expanded (the mixer) each
 * cell is an info button (opens the track's sheet: rename, delete), Mute, Solo and a volume slider.
 * Arming happens on the track's name pill over the lanes. It follows the lanes' vertical scroll (`laneScroll`) but never scrolls with time.
 */
export function TrackColumn({
  tracks,
  top,
  width,
  armWidth,
  expanded,
  lane,
  laneScroll,
  editDisabled,
  anySolo,
  draft,
  onEdit,
  onToggleMute,
  onToggleSolo,
  onVolumeDrag,
  onVolumeRelease,
}: {
  tracks: Pick<Track, 'id' | 'name' | 'volume' | 'muted' | 'solo'>[];
  /** Where the lanes start (below the ruler). */
  top: number;
  width: number;
  /** Width of the collapsed column: the grab handle, and the info button's area in the mixer. */
  armWidth: number;
  /** Show the mixer controls. */
  expanded: boolean;
  lane: number;
  laneScroll: SharedValue<number>;
  /** While recording: tracks can't be edited. */
  editDisabled: boolean;
  /** Some track is soloed, so tracks that aren't are silent. */
  anySolo: boolean;
  draft: FaderDraft | null;
  /** Open the track's sheet. */
  onEdit: (trackId: string) => void;
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
          const silent = anySolo ? !track.solo : track.muted;
          return (
            <View
              key={track.id}
              style={[
                styles.cell,
                { height: lane },
                index % 2 === 1 && styles.cellAlt,
                expanded && styles.cellMixer,
              ]}>
              {expanded ? null : (
                <View style={[styles.armArea, { width: armWidth }]}>
                  <Icon
                    name={{ ios: 'line.3.horizontal', android: 'drag_indicator' }}
                    size={14}
                    color="textSecondary"
                    style={styles.grip}
                  />
                </View>
              )}
              {expanded ? (
                <View style={styles.mixer}>
                  <View style={[styles.armArea, { width: armWidth }]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${track.name} settings`}
                      accessibilityState={{ disabled: editDisabled }}
                      disabled={editDisabled}
                      hitSlop={8}
                      onPress={() => onEdit(track.id)}
                      style={({ pressed }) => [
                        styles.info,
                        editDisabled && styles.disabled,
                        pressed && styles.pressed,
                      ]}>
                      <Icon
                        name={{ ios: 'info.circle', android: 'info' }}
                        size={22}
                        color="textSecondary"
                      />
                    </Pressable>
                  </View>
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
    backgroundColor: t.colors.background,
  },
  cell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
    // A solid right edge on each track's cell (same as the mixer toggle's), ending at the last track.
    borderRightWidth: 1,
    borderRightColor: t.colors.textTertiary,
    backgroundColor: t.colors.background,
  },
  cellAlt: { backgroundColor: t.colors.laneAlt },
  cellMixer: { paddingHorizontal: t.spacing.sm },
  armArea: { alignItems: 'center', justifyContent: 'center' },
  info: { width: INFO_SIZE, height: INFO_SIZE, alignItems: 'center', justifyContent: 'center' },
  grip: { opacity: 0.6 },
  mixer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
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
