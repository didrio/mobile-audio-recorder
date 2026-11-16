import { useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { playbackPosition } from '@/features/audio/audio-engine';
import { makeStyles } from '@/theme';

import { seekQuickListen, useQuickListenStore } from './quick-listen';
import { playedFraction, scrubFraction } from './scrub-math';

const POLL_MS = 100;
const THUMB = 14;

/**
 * The thin scrubber under the idea that quick-listens (T48): the bar follows the audio, a drag or a
 * tap seeks (playback restarts from there on release). Mounted only for the playing row.
 */
export function QuickListenScrubber({ duration }: { duration: number }) {
  const styles = useStyles();
  const from = useQuickListenStore((state) => state.from);
  const [width, setWidth] = useState(0);
  const [position, setPosition] = useState<number | null>(null);
  /** While the finger is down: where it is (0..1); the audio position is ignored. */
  const [dragging, setDragging] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setPosition(playbackPosition()), POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const fraction = dragging ?? playedFraction(position ?? from, duration);

  const release = (x: number) => {
    setDragging(null);
    void seekQuickListen(scrubFraction(x, width) * duration);
  };
  const gesture = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-4, 4])
    .failOffsetY([-12, 12])
    .onBegin((event) => setDragging(scrubFraction(event.x, width)))
    .onUpdate((event) => setDragging(scrubFraction(event.x, width)))
    .onEnd((event) => release(event.x))
    .onFinalize(() => setDragging(null));
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((event) => release(event.x));

  return (
    <GestureDetector gesture={Gesture.Race(gesture, tap)}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Playback position"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
        style={styles.touch}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
        </View>
        <View style={[styles.thumb, { left: fraction * width - THUMB / 2 }]} />
      </View>
    </GestureDetector>
  );
}

const useStyles = makeStyles((t) => ({
  touch: { height: 28, justifyContent: 'center' },
  track: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: t.colors.border,
  },
  fill: { height: 3, backgroundColor: t.colors.primary },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: t.colors.primary,
  },
}));
