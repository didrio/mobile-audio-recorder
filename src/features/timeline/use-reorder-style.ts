import {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { laneShift } from './reorder-math';

/** How much a lifted track grows, and how see-through it gets (at full lift). */
export const LIFT_SCALE = 0.03;
export const LIFT_FADE = 0.12;

/**
 * A track being dragged to a new place (T23), shared by everything drawn per track: the column cell,
 * the Skia lane with its clips and the name pill. Moved on the UI thread by the column's gesture.
 *
 * The lifted track is kept by **id**, and each consumer looks up its index in the track order of its
 * current render. So when the drop's new order arrives, the lifted track's index equals the drop slot
 * and every shift is 0: the layout is the same before and after that render, nothing snaps.
 */
export type TrackDrag = {
  /** The lifted track, or null. */
  id: SharedValue<string | null>;
  /** Content y of the lifted lane's top (lane `i` normally sits at `i * lane`). */
  top: SharedValue<number>;
  /** The slot it would drop into, animated, so the other lanes glide aside. */
  progress: SharedValue<number>;
  /** 0 → 1 while it's picked up: drives the scale, transparency and shadow. */
  lift: SharedValue<number>;
  /** The slot it was dropped into once it has settled there (-1 while dragging or idle). */
  dropped: SharedValue<number>;
};

/**
 * The drag state for a timeline. `trackIds` is the current track order. A dropped track stays "lifted"
 * (at lift 0, in its new slot) until a render's order has it in that slot, then the drag is cleared on
 * the UI thread. Right away for a drop back where it was; after the saved move re-renders otherwise.
 * Clearing earlier would draw the old order for a frame; clearing later would apply a stale drag to the
 * next order change (undo).
 */
export function useTrackDrag(trackIds: string[]): TrackDrag {
  const id = useSharedValue<string | null>(null);
  const top = useSharedValue(0);
  const progress = useSharedValue(0);
  const lift = useSharedValue(0);
  const dropped = useSharedValue(-1);
  const order = trackIds.join(',');
  useAnimatedReaction(
    () => {
      const current = id.get();
      const slot = dropped.get();
      return current != null && slot >= 0 && trackIds.indexOf(current) === slot;
    },
    (settled) => {
      if (!settled) return;
      id.set(null);
      dropped.set(-1);
    },
    [order],
  );
  return { id, top, progress, lift, dropped };
}

/**
 * Animated style for a per-track row (column cell, name pill) laid out at `index * lane`: follows the
 * finger and lifts when it's the dragged track, slides aside when another one passes it.
 */
export function useReorderStyle(
  index: number,
  trackIds: string[],
  drag: TrackDrag,
  lane: number,
  {
    shadow = false,
    background,
    liftedBackground,
  }: {
    shadow?: boolean;
    /** The row's own background, and the raised one it gets while lifted (both or neither). */
    background?: string;
    liftedBackground?: string;
  } = {},
) {
  return useAnimatedStyle(() => {
    const id = drag.id.get();
    const from = id == null ? -1 : trackIds.indexOf(id);
    if (index !== from) {
      return {
        ...(background ? { backgroundColor: background } : null),
        zIndex: 0,
        opacity: 1,
        boxShadow: 'none',
        transform: [
          { translateY: from < 0 ? 0 : laneShift(index, from, drag.progress.get(), lane) },
          { scale: 1 },
        ],
      };
    }
    const lift = drag.lift.get();
    return {
      ...(liftedBackground ? { backgroundColor: liftedBackground } : null),
      zIndex: 1,
      opacity: 1 - LIFT_FADE * lift,
      boxShadow:
        shadow && lift > 0
          ? `0px ${4 * lift}px ${12 * lift}px rgba(0, 0, 0, ${0.3 * lift})`
          : 'none',
      transform: [{ translateY: drag.top.get() - index * lane }, { scale: 1 + LIFT_SCALE * lift }],
    };
  });
}
