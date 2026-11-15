import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  GestureDetector,
  GestureStateManager,
  useManualGesture,
  type GestureTouchEvent,
} from 'react-native-gesture-handler';

import { Icon, Text, type IconName } from '@/components/ui';
import {
  prepareKeyboard,
  startNote,
  stopNote,
  type NoteHandle,
} from '@/features/audio/audio-engine';
import {
  BLACK_KEY_HEIGHT,
  HIGHEST_NOTE,
  keyAt,
  keyboardKeys,
  LOWEST_NOTE,
  noteFrequency,
  noteName,
  octaveStart,
} from '@/features/audio/pitch';
import { useKeyboardSettingsStore } from '@/features/settings/keyboard-settings-store';
import { makeStyles } from '@/theme';

/** White keys get at least this wide; as many fit as the sheet allows, between the two counts. */
const MIN_WHITE_KEY_WIDTH = 40;
const MIN_WHITE_KEYS = 8;
const MAX_WHITE_KEYS = 15;
/** A key tapped with a screen reader sounds this long. */
const ACCESSIBLE_NOTE_MS = 700;

/** The highest C the keyboard can start at, so its first octave stays in range. */
const HIGHEST_START = octaveStart(HIGHEST_NOTE) - 12;

/**
 * The pitch reference keyboard (T20): a short sheet over the idea, so the timeline stays in view and
 * you can play along with playback. As many white keys as fit (one octave at least, two on a wide
 * screen) from a C, with octave buttons; several fingers at once, and sliding across keys plays each
 * one. Held notes are named at the top. The sound is synthesized (`startNote` in the engine), at the
 * Settings → Pitch keyboard volume. A reference tool only: nothing is recorded or put on the
 * timeline (other than what the mic hears).
 */
export function PitchKeyboardSheet() {
  const styles = useStyles();
  const start = useKeyboardSettingsStore((state) => state.keyboardStart);
  const setStart = useKeyboardSettingsStore((state) => state.setKeyboardStart);
  const volume = useKeyboardSettingsStore((state) => state.keyboardVolume);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const whiteCount = Math.min(
    MAX_WHITE_KEYS,
    Math.max(MIN_WHITE_KEYS, Math.floor(size.width / MIN_WHITE_KEY_WIDTH)),
  );
  const keys = keyboardKeys(start, whiteCount);
  const whiteWidth = size.width / whiteCount;
  const [held, setHeld] = useState<number[]>([]);
  // Each finger on the keyboard and the note it holds.
  const fingers = useRef(new Map<number, { midi: number; note: NoteHandle | null }>());

  useEffect(() => {
    void prepareKeyboard();
    const current = fingers.current;
    return () => {
      for (const finger of current.values()) if (finger.note) stopNote(finger.note);
      current.clear();
    };
  }, []);

  const showHeld = () =>
    setHeld([...new Set([...fingers.current.values()].map((finger) => finger.midi))].sort());

  const press = (id: number, midi: number) => {
    void Haptics.selectionAsync();
    fingers.current.set(id, { midi, note: startNote(noteFrequency(midi), volume) });
  };
  const release = (id: number) => {
    const finger = fingers.current.get(id);
    if (finger?.note) stopNote(finger.note);
    fingers.current.delete(id);
  };
  const keyUnder = (touch: { x: number; y: number }) =>
    whiteWidth > 0 && size.height > 0
      ? keyAt(keys, touch.x / whiteWidth, touch.y / size.height)
      : null;

  // One gesture for the whole keyboard that follows every finger: a finger sliding onto another key
  // releases the old note and plays the new one; one sliding off the keyboard releases.
  const followFingers = (event: GestureTouchEvent) => {
    for (const touch of event.changedTouches) {
      const midi = keyUnder(touch);
      const current = fingers.current.get(touch.id);
      if (current?.midi === midi) continue;
      if (current) release(touch.id);
      if (midi !== null) press(touch.id, midi);
    }
    showHeld();
  };
  const liftFingers = (event: GestureTouchEvent) => {
    for (const touch of event.changedTouches) release(touch.id);
    showHeld();
  };
  const gesture = useManualGesture({
    runOnJS: true,
    onTouchesDown: (event) => {
      // Claim the touches, so the sheet doesn't take a slide on the keys.
      GestureStateManager.activate(event.handlerTag);
      followFingers(event);
    },
    onTouchesMove: followFingers,
    onTouchesUp: liftFingers,
    onTouchesCancel: liftFingers,
  });

  const playBriefly = (midi: number) => {
    const note = startNote(noteFrequency(midi), volume);
    if (note) setTimeout(() => stopNote(note), ACCESSIBLE_NOTE_MS);
  };

  const first = keys[0]?.midi ?? start;
  const last = keys[whiteCount - 1]?.midi ?? start;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <OctaveButton
          label="Octave down"
          icon={{ ios: 'chevron.left', android: 'chevron_left' }}
          disabled={start - 12 < LOWEST_NOTE}
          onPress={() => setStart(start - 12)}
        />
        <View style={styles.title}>
          <Text
            variant="title2"
            align="center"
            numberOfLines={1}
            color={held.length > 0 ? 'text' : 'textTertiary'}
            accessibilityLiveRegion="polite">
            {held.length > 0 ? held.map(noteName).join('  ') : 'Touch a key'}
          </Text>
          <Text variant="footnote" color="textSecondary" align="center">
            {`${noteName(first)} – ${noteName(last)}`}
          </Text>
        </View>
        <OctaveButton
          label="Octave up"
          icon={{ ios: 'chevron.right', android: 'chevron_right' }}
          disabled={start + 12 > HIGHEST_START}
          onPress={() => setStart(start + 12)}
        />
      </View>
      <GestureDetector gesture={gesture}>
        <View
          testID="keyboard-keys"
          style={styles.keys}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setSize({ width, height });
          }}>
          {size.width > 0
            ? keys.map((key) => (
                <View
                  key={key.midi}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={noteName(key.midi)}
                  accessibilityHint="Plays the note"
                  accessibilityActions={[{ name: 'activate' }]}
                  onAccessibilityAction={() => playBriefly(key.midi)}
                  style={[
                    key.black ? styles.blackKey : styles.whiteKey,
                    {
                      left: key.x * whiteWidth,
                      width: key.width * whiteWidth,
                      height: key.black ? size.height * BLACK_KEY_HEIGHT : size.height,
                    },
                    held.includes(key.midi) && styles.heldKey,
                  ]}>
                  {!key.black && key.midi % 12 === 0 ? (
                    <Text variant="caption" color="keyLabel" align="center">
                      {noteName(key.midi)}
                    </Text>
                  ) : null}
                </View>
              ))
            : null}
        </View>
      </GestureDetector>
    </View>
  );
}

function OctaveButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: IconName;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.octaveButton,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Icon name={icon} size={18} color="primary" />
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  root: {
    flex: 1,
    paddingHorizontal: t.spacing.lg,
    paddingTop: t.spacing.xl,
    paddingBottom: t.spacing.xl,
    gap: t.spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  title: { flex: 1, gap: t.spacing.xxs },
  octaveButton: {
    width: 40,
    height: 40,
    borderRadius: t.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.surfacePressed,
  },
  keys: { flex: 1, minHeight: 140 },
  whiteKey: {
    position: 'absolute',
    top: 0,
    justifyContent: 'flex-end',
    paddingBottom: t.spacing.sm,
    backgroundColor: t.colors.keyWhite,
    borderWidth: 1,
    borderColor: t.colors.keyBorder,
    borderBottomLeftRadius: t.radius.sm,
    borderBottomRightRadius: t.radius.sm,
  },
  blackKey: {
    position: 'absolute',
    top: 0,
    backgroundColor: t.colors.keyBlack,
    borderBottomLeftRadius: t.radius.sm,
    borderBottomRightRadius: t.radius.sm,
  },
  heldKey: { backgroundColor: t.colors.keyHeld },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
}));
