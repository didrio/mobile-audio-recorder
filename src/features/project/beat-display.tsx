import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { beatAt, beatGroups } from '@/features/audio/metronome';
import type { Meter } from '@/features/audio/tempo';
import type { TypographyVariant } from '@/theme';
import { makeStyles } from '@/theme';

/** How long a beat's flash lasts before it settles to its lit level. */
const FLASH_SECONDS = 0.15;
/** Opacity of the lit block after its flash (1 at the beat itself). */
const LIT_REST_OPACITY = 0.6;
/**
 * A frame drawn now reaches the screen about one frame later, so the display looks that far ahead
 * to light each beat as its click is heard.
 */
const DISPLAY_LEAD_SECONDS = 1 / 60;

export const BEAT_DISPLAY_HEIGHT = 64;

type Lit = { inBar: number; sinceBeat: number } | null;

/**
 * The visual metronome (T33): one large block per beat of the bar across the screen, grouped in
 * threes for 6/8 and 12/8. The current beat is lit and flashes as it starts, the downbeat in its
 * own color, readable from a phone lying a few feet away.
 *
 * Driven on the UI thread by the transport's `beatClock` (the time being heard, so it lines up with
 * the clicks and the grid, and counts in before 0:00), with no React renders per beat. Lit layers
 * only change opacity. Stopped (`null`): every beat dim.
 */
export function BeatDisplay({ clock, meter }: { clock: SharedValue<number | null>; meter: Meter }) {
  const styles = useStyles();
  const { bpm, beatsPerBar, beatUnit } = meter;
  const lit = useDerivedValue<Lit>(() => {
    const time = clock.get();
    if (time === null) return null;
    const position = beatAt({ bpm, beatsPerBar, beatUnit }, time + DISPLAY_LEAD_SECONDS);
    return position ? { inBar: position.inBar, sinceBeat: position.sinceBeat } : null;
  });
  // Two-digit numbers (12/8) need a smaller size to fit their narrower blocks.
  const variant: TypographyVariant = beatsPerBar > 7 ? 'title2' : 'beatNumber';
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Visual metronome">
      {groupStarts(beatGroups(beatsPerBar, beatUnit)).map(({ start, size }) => (
        <View key={start} style={styles.group}>
          {Array.from({ length: size }, (_, i) => (
            <BeatBlock key={start + i} index={start + i} lit={lit} variant={variant} />
          ))}
        </View>
      ))}
    </View>
  );
}

function BeatBlock({
  index,
  lit,
  variant,
}: {
  index: number;
  lit: SharedValue<Lit>;
  variant: TypographyVariant;
}) {
  const styles = useStyles();
  const downbeat = index === 0;
  const litStyle = useAnimatedStyle(() => {
    const current = lit.get();
    if (!current || current.inBar !== index) return { opacity: 0 };
    const flash = Math.max(0, 1 - current.sinceBeat / FLASH_SECONDS);
    return { opacity: LIT_REST_OPACITY + (1 - LIT_REST_OPACITY) * flash };
  });
  const label = String(index + 1);
  return (
    <View style={styles.block}>
      <Text variant={variant} color="textTertiary" numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
      <Animated.View style={[styles.lit, downbeat ? styles.litDownbeat : styles.litBeat, litStyle]}>
        <Text
          variant={variant}
          color={downbeat ? 'onDownbeat' : 'background'}
          numberOfLines={1}
          adjustsFontSizeToFit>
          {label}
        </Text>
      </Animated.View>
    </View>
  );
}

/** Each group's first beat (in the bar) and size. */
function groupStarts(groups: number[]): { start: number; size: number }[] {
  return groups.map((size, i) => ({
    start: groups.slice(0, i).reduce((sum, previous) => sum + previous, 0),
    size,
  }));
}

const useStyles = makeStyles((t) => ({
  row: {
    height: BEAT_DISPLAY_HEIGHT,
    flexDirection: 'row',
    gap: t.spacing.md,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.xs,
  },
  group: { flex: 1, flexDirection: 'row', gap: t.spacing.xs },
  block: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceMuted,
    overflow: 'hidden',
  },
  lit: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  litBeat: { backgroundColor: t.colors.text },
  litDownbeat: { backgroundColor: t.colors.downbeat },
}));
