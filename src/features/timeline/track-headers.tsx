import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Text } from '@/components/ui';
import type { Track } from '@/features/projects/projects-repo';
import { makeStyles } from '@/theme';

import type { Orientation } from './timeline-axis';

const ARM_SIZE = 28;

/**
 * One header chip per track, floating at the leading corner of its lane: an arm button (the
 * armed track is the one Record records onto) and the track name (opens the track's settings).
 * Laid out with the same ruler and lane sizes as the Skia timeline and moved with its cross scroll.
 */
export function TrackHeaders({
  tracks,
  orientation,
  rulerSize,
  lane,
  inset,
  crossScroll,
  armedTrackId,
  disabled,
  onArm,
  onEdit,
}: {
  tracks: Pick<Track, 'id' | 'name'>[];
  orientation: Orientation;
  /** Thickness of the ruler band the lanes start after. */
  rulerSize: number;
  /** Thickness of one lane across the time axis. */
  lane: number;
  /** Gap between the chip and the lane edges. */
  inset: number;
  crossScroll: SharedValue<number>;
  armedTrackId: string | null;
  /** While recording: tracks can't be armed or edited. */
  disabled: boolean;
  onArm: (trackId: string) => void;
  onEdit: (trackId: string) => void;
}) {
  const styles = useStyles();
  const isPortrait = orientation === 'portrait';
  const scrolled = useAnimatedStyle(() =>
    isPortrait
      ? { transform: [{ translateX: -crossScroll.get() }] }
      : { transform: [{ translateY: -crossScroll.get() }] },
  );

  return (
    <View
      pointerEvents="box-none"
      style={[styles.viewport, isPortrait ? { left: rulerSize } : { top: rulerSize }]}>
      <Animated.View pointerEvents="box-none" style={[styles.fill, scrolled]}>
        {tracks.map((track, index) => {
          const armed = track.id === armedTrackId;
          const cross = index * lane + inset;
          const position = isPortrait
            ? { left: cross, top: inset, maxWidth: lane - inset * 2 }
            : { top: cross, left: inset, maxWidth: lane * 3 };
          return (
            <View key={track.id} style={[styles.chip, position]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Arm ${track.name}`}
                accessibilityState={{ selected: armed, disabled }}
                disabled={disabled}
                hitSlop={6}
                onPress={() => {
                  void Haptics.selectionAsync();
                  onArm(track.id);
                }}
                style={[styles.arm, armed && styles.armed, disabled && styles.disabled]}>
                {armed ? <View style={styles.armDot} /> : null}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${track.name} settings`}
                accessibilityState={{ disabled }}
                disabled={disabled}
                hitSlop={6}
                onPress={() => onEdit(track.id)}
                style={({ pressed }) => [styles.name, pressed && styles.pressed]}>
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {track.name}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  viewport: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  fill: { flex: 1 },
  chip: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    padding: t.spacing.xxs,
    paddingRight: t.spacing.sm,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.trackHeader,
  },
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
  name: { flexShrink: 1, paddingVertical: t.spacing.xs },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
}));
