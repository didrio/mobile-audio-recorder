/**
 * Section labels (T18): the song's structure (Intro, Verse, Chorus…) on a colored rail above the ruler.
 * A section is a named, colored span of the timeline with an optional note; sections never overlap.
 * This file holds what isn't geometry: the color palette, the presets and their naming. Geometry is in
 * `@/features/timeline/section-math`, edits in `edit-commands.ts`.
 */
import type { ColorName } from '@/theme';

export const SECTION_COLORS = [
  { key: 'red', label: 'Red', token: 'sectionRed' },
  { key: 'orange', label: 'Orange', token: 'sectionOrange' },
  { key: 'yellow', label: 'Yellow', token: 'sectionYellow' },
  { key: 'green', label: 'Green', token: 'sectionGreen' },
  { key: 'teal', label: 'Teal', token: 'sectionTeal' },
  { key: 'blue', label: 'Blue', token: 'sectionBlue' },
  { key: 'purple', label: 'Purple', token: 'sectionPurple' },
  { key: 'pink', label: 'Pink', token: 'sectionPink' },
] as const satisfies readonly { key: string; label: string; token: ColorName }[];

export type SectionColor = (typeof SECTION_COLORS)[number]['key'];

/** Color of a section whose stored color isn't known (and of a new custom section). */
export const DEFAULT_SECTION_COLOR: SectionColor = 'blue';

export function isSectionColor(value: string): value is SectionColor {
  return SECTION_COLORS.some((color) => color.key === value);
}

/** The theme color (token) a section color is drawn with. */
export function sectionColorToken(color: SectionColor): ColorName {
  return SECTION_COLORS.find((candidate) => candidate.key === color)?.token ?? 'sectionBlue';
}

export const SECTION_PRESETS: readonly { name: string; color: SectionColor }[] = [
  { name: 'Intro', color: 'teal' },
  { name: 'Verse', color: 'blue' },
  { name: 'Pre-chorus', color: 'purple' },
  { name: 'Chorus', color: 'orange' },
  { name: 'Bridge', color: 'green' },
  { name: 'Outro', color: 'pink' },
];

/** A new section's length with the grid on (bars) and off (seconds). */
export const DEFAULT_SECTION_BARS = 8;
export const DEFAULT_SECTION_SECONDS = 15;
/** The shortest a section can be (seconds). */
export const MIN_SECTION_SECONDS = 1;
/** Longest section name and note (characters). */
export const SECTION_NAME_MAX = 40;

/**
 * The name for another section from preset `base`: `base` itself the first time, then "base 2",
 * "base 3"… (one more than the highest number already used; a plain `base` counts as 1).
 */
export function presetName(base: string, existingNames: readonly string[]): string {
  let highest = 0;
  const prefix = `${base} `;
  for (const name of existingNames) {
    if (name === base) highest = Math.max(highest, 1);
    else if (name.startsWith(prefix)) {
      const rest = name.slice(prefix.length);
      if (/^\d+$/.test(rest)) highest = Math.max(highest, Number(rest));
    }
  }
  return highest === 0 ? base : `${base} ${highest + 1}`;
}
