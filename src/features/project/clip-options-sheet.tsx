import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, ListSection, Screen, SegmentedControl, Text } from '@/components/ui';
import { formatTimecode } from '@/features/audio/format-time';
import type { Clip, Project } from '@/features/projects/projects-repo';
import { formatDb } from '@/features/timeline/fader-math';
import { VolumeSlider } from '@/features/timeline/volume-slider';
import { makeStyles } from '@/theme';

import { restoredClipWindow } from './edit-commands';
import { deleteClip, restoreClip, setClipOptions, useEditorStore } from './editor-store';
import { replayEdited } from './transport-link';

/** Fade lengths offered (seconds); a fade longer than the clip is shortened when it plays. */
export const FADE_CHOICES = [0, 0.1, 0.5, 1, 2, 4] as const;

const fadeOptions = FADE_CHOICES.map((seconds) => ({
  value: String(seconds),
  label: seconds === 0 ? 'Off' : `${seconds} s`,
}));

/** The offered fade closest to `seconds`, as its option value. */
function fadeChoice(seconds: number): string {
  let best: number = FADE_CHOICES[0];
  for (const choice of FADE_CHOICES) {
    if (Math.abs(choice - seconds) < Math.abs(best - seconds)) best = choice;
  }
  return String(best);
}

/**
 * The selected clip's options (T16), from the clip action bar's "Options": clip gain (dB slider,
 * double-tap resets), fade in and fade out, "Restore full take" (the trim back to the whole take, as
 * far as its neighbors and 0:00 allow) and Delete. Each change is one undo step; playback picks it
 * up at once (`replayEdited`).
 */
export function ClipOptionsSheet() {
  const params = useLocalSearchParams<{ id: string; projectId: string }>();
  const project = useEditorStore((state) =>
    state.projectId === params.projectId ? state.project : null,
  );
  const track = project?.tracks.find((candidate) =>
    candidate.clips.some((clip) => clip.id === params.id),
  );
  const clip = track?.clips.find((candidate) => candidate.id === params.id);
  // Gone (deleted, or undone away): nothing to show.
  if (!project || !track || !clip) return null;
  return <ClipOptionsForm key={clip.id} project={project} trackName={track.name} clip={clip} />;
}

function ClipOptionsForm({
  project,
  trackName,
  clip,
}: {
  project: Project;
  trackName: string;
  clip: Clip;
}) {
  const styles = useStyles();
  const router = useRouter();
  // The gain while the slider is dragged (saved once, on release).
  const [draggedGain, setDraggedGain] = useState<number | null>(null);
  const gain = draggedGain ?? clip.gain;
  const canRestore = restoredClipWindow(project, clip.id) != null;

  const change = (patch: Partial<Pick<Clip, 'gain' | 'fadeIn' | 'fadeOut'>>, label: string) => {
    if (setClipOptions(clip.id, patch, label)) replayEdited();
  };

  return (
    <Screen grouped contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text variant="headline" accessibilityRole="header" align="center">
          Clip options
        </Text>
        <Text variant="footnote" color="textSecondary" align="center">
          {`${trackName} · ${formatTimecode(clip.start)} – ${formatTimecode(clip.start + clip.duration)}`}
        </Text>
      </View>

      <ListSection title="Gain" footer="Double-tap the slider to reset it to 0 dB.">
        <View style={styles.gainRow}>
          <VolumeSlider
            label="Clip gain"
            gain={gain}
            onDrag={setDraggedGain}
            onRelease={(value) => {
              setDraggedGain(null);
              change({ gain: value }, 'Clip gain');
            }}
          />
          <Text variant="footnote" color="textSecondary" style={styles.gainValue}>
            {formatDb(gain)}
          </Text>
        </View>
      </ListSection>

      <ListSection title="Fade in">
        <View style={styles.segmentRow}>
          <SegmentedControl
            accessibilityLabel="Fade in"
            options={fadeOptions}
            value={fadeChoice(clip.fadeIn)}
            onChange={(value) => change({ fadeIn: Number(value) }, 'Fade in')}
          />
        </View>
      </ListSection>

      <ListSection title="Fade out">
        <View style={styles.segmentRow}>
          <SegmentedControl
            accessibilityLabel="Fade out"
            options={fadeOptions}
            value={fadeChoice(clip.fadeOut)}
            onChange={(value) => change({ fadeOut: Number(value) }, 'Fade out')}
          />
        </View>
      </ListSection>

      <View style={styles.buttons}>
        <Button
          title="Restore"
          accessibilityLabel="Restore full take"
          accessibilityHint="Brings back the parts of the take that were trimmed away, as far as the clips next to it allow"
          variant="secondary"
          icon={{ ios: 'arrow.left.and.right', android: 'expand' }}
          disabled={!canRestore}
          style={styles.button}
          onPress={() => {
            if (restoreClip(clip.id)) replayEdited();
          }}
        />
        <Button
          title="Delete"
          accessibilityLabel="Delete clip"
          variant="destructive"
          icon={{ ios: 'trash', android: 'delete' }}
          style={styles.button}
          onPress={() => {
            router.back();
            void deleteClip(clip.id);
            replayEdited();
          }}
        />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  content: { paddingTop: t.spacing.lg, paddingBottom: t.spacing.xl, gap: t.spacing.md },
  header: { gap: t.spacing.xxs, paddingHorizontal: t.spacing.lg },
  gainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.sm,
  },
  gainValue: { minWidth: 60, textAlign: 'right', fontVariant: ['tabular-nums'] },
  segmentRow: { padding: t.spacing.sm },
  buttons: { flexDirection: 'row', gap: t.spacing.md, paddingHorizontal: t.spacing.lg },
  button: { flex: 1 },
}));
