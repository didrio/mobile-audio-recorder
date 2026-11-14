import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { Icon, Text } from '@/components/ui';
import type { Track } from '@/features/projects/projects-repo';
import { makeStyles } from '@/theme';

import { formatDb } from './fader-math';
import { hiddenLanes, laneScrollMax, pageScroll } from './timeline-math';
import type { FaderDraft } from './track-column';

const PAGE_SCROLL_MS = 250;
/** Extra space above and left of a name pill, on top of the lane inset. */
const PILL_MARGIN = 4;

/**
 * RN views over the lanes, moved with their vertical scroll: each track's name floating at the
 * top-left of its lane (tap to arm the track for recording; shows the dB while its volume moves, and M / S
 * badges when it's muted or soloed, so that shows with the mixer closed), the
 * "+ New Track" row after the last lane, and "N more" chevrons at the top / bottom edge when lanes
 * are scrolled out of view (tap: one page).
 */
export function LaneOverlay({
  tracks,
  top,
  left,
  viewport,
  lane,
  inset,
  footer,
  laneScroll,
  draft,
  armedTrackId,
  armDisabled,
  addTrackDisabled,
  onArm,
  onAddTrack,
}: {
  tracks: Pick<Track, 'id' | 'name' | 'muted' | 'solo'>[];
  /** Where the lanes start (below the ruler). */
  top: number;
  /** Where the time area starts (after the controls column). */
  left: number;
  /** Visible height of the lanes area. */
  viewport: number;
  lane: number;
  /** Gap between a name label and the lane edges. */
  inset: number;
  /** Height of the "+ New Track" row. */
  footer: number;
  laneScroll: SharedValue<number>;
  draft: FaderDraft | null;
  /** The track Record records onto: its name gets a red outline and dot. */
  armedTrackId: string | null;
  /** While recording: arming can't change. */
  armDisabled: boolean;
  addTrackDisabled: boolean;
  onArm: (trackId: string) => void;
  onAddTrack: () => void;
}) {
  const styles = useStyles();
  const count = tracks.length;
  const scrolled = useAnimatedStyle(() => ({ transform: [{ translateY: -laneScroll.get() }] }));

  const [hidden, setHidden] = useState(() => hiddenLanes(laneScroll.get(), viewport, lane, count));
  useAnimatedReaction(
    () => hiddenLanes(laneScroll.get(), viewport, lane, count),
    (next, previous) => {
      if (previous && next.above === previous.above && next.below === previous.below) return;
      scheduleOnRN(setHidden, next);
    },
  );

  const max = laneScrollMax(viewport, count, lane, footer);
  const page = (direction: 1 | -1) => {
    scheduleOnUI(() => {
      'worklet';
      const target = pageScroll(laneScroll.get(), viewport, lane, direction, max);
      laneScroll.set(withTiming(target, { duration: PAGE_SCROLL_MS }));
    });
  };

  return (
    <View pointerEvents="box-none" style={[styles.viewport, { top }]}>
      <Animated.View pointerEvents="box-none" style={[styles.fill, scrolled]}>
        {tracks.map((track, index) => {
          const level = draft?.trackId === track.id ? formatDb(draft.gain) : null;
          const armed = track.id === armedTrackId;
          return (
            <Pressable
              key={track.id}
              accessibilityRole="button"
              accessibilityLabel={`Arm ${track.name}`}
              accessibilityState={{ selected: armed, disabled: armDisabled }}
              disabled={armDisabled}
              hitSlop={6}
              onPress={() => {
                void Haptics.selectionAsync();
                onArm(track.id);
              }}
              style={({ pressed }) => [
                styles.name,
                {
                  top: index * lane + inset + PILL_MARGIN,
                  left: left + inset + PILL_MARGIN,
                  maxWidth: lane * 3,
                },
                armed && styles.nameArmed,
                pressed && styles.pressed,
              ]}>
              {armed ? <View style={styles.armDot} /> : null}
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {track.name}
              </Text>
              {track.muted ? <Badge letter="M" kind="mute" /> : null}
              {track.solo ? <Badge letter="S" kind="solo" /> : null}
              {level ? (
                <Text variant="caption" color="text" numberOfLines={1}>
                  {level}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New track"
          accessibilityState={{ disabled: addTrackDisabled }}
          disabled={addTrackDisabled}
          onPress={onAddTrack}
          style={({ pressed }) => [
            styles.newTrack,
            // Starts one hairline early so its top border sits on the last lane's separator pixel.
            {
              top: count * lane - StyleSheet.hairlineWidth,
              height: footer + StyleSheet.hairlineWidth,
            },
            addTrackDisabled && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <Icon name={{ ios: 'plus', android: 'add' }} size={16} color="textSecondary" />
          <Text variant="subheadline" color="textSecondary">
            New Track
          </Text>
        </Pressable>
      </Animated.View>
      {hidden.above > 0 ? (
        <MoreChip
          count={hidden.above}
          direction="up"
          style={[styles.more, { top: inset, left }]}
          onPress={() => page(-1)}
        />
      ) : null}
      {hidden.below > 0 ? (
        <MoreChip
          count={hidden.below}
          direction="down"
          style={[styles.more, { bottom: inset, left }]}
          onPress={() => page(1)}
        />
      ) : null}
    </View>
  );
}

function Badge({ letter, kind }: { letter: string; kind: 'mute' | 'solo' }) {
  const styles = useStyles();
  return (
    <View
      style={[styles.badge, kind === 'mute' ? styles.badgeMute : styles.badgeSolo]}
      accessibilityLabel={kind === 'mute' ? 'muted' : 'soloed'}>
      <Text
        variant="caption"
        color={kind === 'mute' ? 'onMute' : 'onSolo'}
        style={styles.badgeText}>
        {letter}
      </Text>
    </View>
  );
}

function MoreChip({
  count,
  direction,
  style,
  onPress,
}: {
  count: number;
  direction: 'up' | 'down';
  style: object;
  onPress: () => void;
}) {
  const styles = useStyles();
  const label = `${count} more`;
  return (
    <View pointerEvents="box-none" style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} ${count === 1 ? 'track' : 'tracks'} ${direction === 'up' ? 'above' : 'below'}`}
        hitSlop={8}
        onPress={onPress}
        style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
        <Icon
          name={
            direction === 'up'
              ? { ios: 'chevron.up', android: 'keyboard_arrow_up' }
              : { ios: 'chevron.down', android: 'keyboard_arrow_down' }
          }
          size={12}
          color="textSecondary"
        />
        <Text variant="caption" color="textSecondary">
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  viewport: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  fill: { flex: 1 },
  name: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingVertical: t.spacing.xxs,
    paddingHorizontal: t.spacing.sm,
    borderRadius: t.radius.full,
    borderWidth: 1,
    borderColor: t.colors.textTertiary,
    backgroundColor: t.colors.trackHeader,
  },
  nameArmed: { borderColor: t.colors.primary },
  armDot: { width: 8, height: 8, borderRadius: t.radius.full, backgroundColor: t.colors.primary },
  newTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
    backgroundColor: t.colors.background,
  },
  more: { position: 'absolute', right: 0, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xxs,
    paddingVertical: t.spacing.xxs,
    paddingHorizontal: t.spacing.sm,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.trackHeader,
  },
  badge: {
    minWidth: 16,
    paddingHorizontal: t.spacing.xxs,
    borderRadius: t.radius.sm / 2,
    alignItems: 'center',
  },
  badgeMute: { backgroundColor: t.colors.mute },
  badgeSolo: { backgroundColor: t.colors.solo },
  badgeText: { fontWeight: '700' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
}));
