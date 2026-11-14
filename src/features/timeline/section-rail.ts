/**
 * Drawing of the section rail (T18): the strip above the ruler with the song's sections (Intro, Verse…)
 * as colored, labelled blocks. Called from the timeline's per-frame Skia picture (a worklet), which owns
 * the gestures; the geometry is in `section-math.ts`.
 */
import { ClipOp, Skia, type SkCanvas, type SkFont, type SkPaint } from '@shopify/react-native-skia';

import type { SectionColor } from '@/features/project/sections';

import { truncateLabel } from './section-math';

export type RailSection = {
  id: string;
  name: string;
  color: SectionColor;
  start: number;
  duration: number;
  hasNotes: boolean;
};

export type RailPaints = {
  background: SkPaint;
  separator: SkPaint;
  fills: Record<SectionColor, SkPaint>;
  label: SkPaint;
  /** Outline and handles of the selected section. */
  selected: SkPaint;
  handle: SkPaint;
  /** Note glyph strokes. */
  glyph: SkPaint;
  /** Fill over a section held before pickup (alpha set per frame). */
  press: SkPaint;
  hint: SkPaint;
  shadow: SkPaint;
};

/** Gap above and below the blocks, and between neighbors. */
const INSET_Y = 3;
const INSET_X = 1;
const RADIUS = 5;
const PADDING = 6;
/** The name starts clear of the selected section's handle. */
const LABEL_INSET = 11;
const GLYPH_WIDTH = 9;
const GLYPH_SPACING = 3;
const HANDLE_WIDTH = 3;
const HANDLE_INSET = 3;
const LIFT_SCALE = 0.04;
const LIFT_SHADOW_Y = 2;

export function drawSectionRail(
  canvas: SkCanvas,
  rail: {
    sections: readonly RailSection[];
    width: number;
    height: number;
    toX: (time: number) => number;
    zoom: number;
    selectedId: string | null;
    /** The section being dragged and where it is now (drawn on top, lifted by `lift`). */
    draggedId: string | null;
    dragged: { start: number; duration: number };
    lift: number;
    pressedId: string | null;
    pressAmount: number;
    paints: RailPaints;
    font: SkFont;
    /** Shown when there are no sections. */
    hint: string | null;
  },
) {
  'worklet';
  const { paints, font, height, width } = rail;
  canvas.save();
  canvas.clipRect(Skia.XYWHRect(0, 0, width, height), ClipOp.Intersect, true);
  canvas.drawRect(Skia.XYWHRect(0, 0, width, height), paints.background);
  canvas.drawLine(0, height, width, height, paints.separator);

  const fontSize = font.getSize();
  const baseline = height / 2 + fontSize * 0.36;
  const measure = (text: string) => {
    'worklet';
    return font.measureText(text).width;
  };

  if (rail.sections.length === 0 && rail.hint) {
    canvas.drawText(rail.hint, PADDING + 2, baseline, paints.hint, font);
  }

  const drawSection = (section: RailSection, start: number, duration: number, lift: number) => {
    'worklet';
    const x0 = rail.toX(start) + INSET_X;
    const x1 = rail.toX(start + duration) - INSET_X;
    if (x1 < 0 || x0 > width || x1 <= x0) return;
    const top = INSET_Y;
    const blockHeight = height - INSET_Y * 2;
    const rect = Skia.XYWHRect(x0, top, x1 - x0, blockHeight);
    const rrect = Skia.RRectXY(rect, RADIUS, RADIUS);
    if (lift > 0) {
      const scale = 1 + LIFT_SCALE * lift;
      const cx = (x0 + x1) / 2;
      canvas.save();
      canvas.translate(cx, height / 2);
      canvas.scale(scale, scale);
      canvas.translate(-cx, -height / 2);
      paints.shadow.setAlphaf(0.3 * lift);
      canvas.drawRRect(
        Skia.RRectXY(
          Skia.XYWHRect(x0, top + LIFT_SHADOW_Y * lift, x1 - x0, blockHeight),
          RADIUS,
          RADIUS,
        ),
        paints.shadow,
      );
    }
    canvas.drawRRect(rrect, paints.fills[section.color]);

    // The name stays in view while the section's start is scrolled off to the left.
    const glyph = section.hasNotes && x1 - x0 >= GLYPH_WIDTH + PADDING * 2 ? GLYPH_WIDTH : 0;
    const labelX = Math.max(x0, 0) + LABEL_INSET;
    const glyphX = x1 - PADDING - glyph;
    const room = (glyph > 0 ? glyphX - GLYPH_SPACING : x1 - PADDING) - labelX;
    const label = room > 0 ? truncateLabel(section.name, room, measure) : '';
    if (label) canvas.drawText(label, labelX, baseline, paints.label, font);
    if (glyph > 0) {
      // A note: three short lines, the last one shorter.
      const middle = height / 2;
      canvas.drawLine(glyphX, middle - 3, glyphX + glyph, middle - 3, paints.glyph);
      canvas.drawLine(glyphX, middle, glyphX + glyph, middle, paints.glyph);
      canvas.drawLine(glyphX, middle + 3, glyphX + glyph * 0.6, middle + 3, paints.glyph);
    }

    if (section.id === rail.pressedId && rail.pressAmount > 0) {
      paints.press.setAlphaf(0.3 * rail.pressAmount);
      canvas.drawRRect(rrect, paints.press);
    }
    if (section.id === rail.selectedId) {
      canvas.drawRRect(rrect, paints.selected);
      const handleTop = top + blockHeight * 0.25;
      const handleHeight = blockHeight * 0.5;
      for (const hx of [x0 + HANDLE_INSET, x1 - HANDLE_INSET - HANDLE_WIDTH]) {
        canvas.drawRRect(
          Skia.RRectXY(Skia.XYWHRect(hx, handleTop, HANDLE_WIDTH, handleHeight), 1.5, 1.5),
          paints.handle,
        );
      }
    }
    if (lift > 0) canvas.restore();
  };

  let draggedSection: RailSection | null = null;
  for (const section of rail.sections) {
    if (section.id === rail.draggedId) draggedSection = section;
    else drawSection(section, section.start, section.duration, 0);
  }
  if (draggedSection) {
    drawSection(draggedSection, rail.dragged.start, rail.dragged.duration, rail.lift);
  }
  canvas.restore();
}
