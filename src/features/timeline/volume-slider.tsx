import { useRef, useState } from 'react';
import { View } from 'react-native';
import {
  GestureDetector,
  usePanGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';

import { makeStyles } from '@/theme';

import { dragPosition, formatDb, gainToPosition, positionToGain, stepGain } from './fader-math';

const THUMB_SIZE = 16;

/**
 * A compact horizontal track-volume slider. Dragging moves the thumb **relative** to where it was
 * (over `FADER_DRAG_RANGE`, a bit longer than the slider, for precision), wherever the finger starts
 * on it. Double-tap resets to 0 dB. Screen readers adjust it in 1 dB steps.
 *
 * Controlled: `gain` is what it shows (the parent passes the live value during a drag). `onDrag`
 * fires per move, `onRelease` once at the end (and for a reset or a step): that one is the edit.
 */
export function VolumeSlider({
  label,
  gain,
  dimmed = false,
  onDrag,
  onRelease,
}: {
  /** Accessibility label, e.g. "Track 1 volume". */
  label: string;
  /** Linear gain, 1 = 0 dB. */
  gain: number;
  /** The track is silent (muted or not soloed): drawn faded, still adjustable. */
  dimmed?: boolean;
  onDrag: (gain: number) => void;
  onRelease: (gain: number) => void;
}) {
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const startPosition = useRef(0);
  const lastGain = useRef(gain);

  const pan = usePanGesture({
    runOnJS: true,
    activeOffsetX: [-4, 4],
    failOffsetY: [-16, 16],
    onActivate: () => {
      startPosition.current = gainToPosition(gain);
      lastGain.current = gain;
    },
    onUpdate: (event) => {
      const next = positionToGain(dragPosition(startPosition.current, event.translationX));
      if (next === lastGain.current) return;
      lastGain.current = next;
      onDrag(next);
    },
    onDeactivate: () => {
      onRelease(lastGain.current);
    },
  });
  const doubleTap = useTapGesture({
    runOnJS: true,
    numberOfTaps: 2,
    onActivate: () => {
      onDrag(1);
      onRelease(1);
    },
  });
  const gesture = useSimultaneousGestures(pan, doubleTap);

  const travel = Math.max(0, width - THUMB_SIZE);
  const thumbLeft = gainToPosition(gain) * travel;

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[styles.root, dimmed && styles.dimmed]}
        hitSlop={{ top: 12, bottom: 12 }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: formatDb(gain) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          const step = event.nativeEvent.actionName === 'increment' ? 1 : -1;
          onRelease(stepGain(gain, step));
        }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        <View style={styles.track} />
        <View style={[styles.fill, { width: thumbLeft + THUMB_SIZE / 2 }]} />
        <View style={[styles.thumb, { left: thumbLeft }]} />
      </View>
    </GestureDetector>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, height: THUMB_SIZE + t.spacing.md, justifyContent: 'center' },
  dimmed: { opacity: 0.4 },
  track: {
    position: 'absolute',
    left: THUMB_SIZE / 2,
    right: THUMB_SIZE / 2,
    height: 4,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfacePressed,
  },
  fill: {
    position: 'absolute',
    left: THUMB_SIZE / 2,
    height: 4,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.textTertiary,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.textSecondary,
  },
}));
