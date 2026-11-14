import { darkColors, lightColors, type ThemeColors } from '@/theme';

import { presetName, SECTION_COLORS, sectionColorToken } from './sections';

describe('presetName', () => {
  it('numbers repeated presets: Verse, Verse 2, Verse 3…', () => {
    expect(presetName('Verse', [])).toBe('Verse');
    expect(presetName('Verse', ['Intro', 'Verse'])).toBe('Verse 2');
    expect(presetName('Verse', ['Verse', 'Verse 2', 'Verse 5'])).toBe('Verse 6');
    expect(presetName('Verse', ['Verse 2'])).toBe('Verse 3');
    expect(presetName('Verse', ['Verses', 'Verse two'])).toBe('Verse');
  });
});

/** WCAG relative luminance of a `#RRGGBB` color. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('section palette', () => {
  it.each([
    ['light', lightColors],
    ['dark', darkColors],
  ] as [string, ThemeColors][])('label text is readable on every color (%s)', (_, colors) => {
    for (const { key } of SECTION_COLORS) {
      expect(contrast(colors[sectionColorToken(key)], colors.onSection)).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });
});
