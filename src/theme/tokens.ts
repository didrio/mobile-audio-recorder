/**
 * Design tokens: the single source of truth for color, spacing, radius and type.
 *
 * Rules:
 * - Components never hard-code hex colors, font sizes or magic spacing numbers — use these tokens.
 * - Colors are *semantic* (what they mean), not literal (what they look like). Add a semantic name
 *   to BOTH `light` and `dark` when you need a new one; TypeScript enforces they stay in sync.
 * - To rebrand an app, start by changing `brand` and the `primary` colors below.
 */
import { Platform } from 'react-native';

/** Recording red. Kept distinct from `danger` so destructive actions still read differently. */
const brand = {
  light: '#D92D20',
  dark: '#FF5147',
} as const;

export const lightColors = {
  /** Screen background. */
  background: '#FFFFFF',
  /** Grouped/secondary background (iOS "systemGroupedBackground"). */
  backgroundGrouped: '#F2F2F7',
  /** List rows and panels on a grouped screen (`backgroundGrouped`). */
  surface: '#FFFFFF',
  /** Filled panels (e.g. `Card`) on a plain screen (`background`). */
  surfaceMuted: '#F2F2F7',
  /** Pressed / selected surface. */
  surfacePressed: '#E5E5EA',
  text: '#000000',
  textSecondary: '#6C6C70',
  textTertiary: '#AEAEB2',
  border: '#D1D1D6',
  primary: brand.light,
  onPrimary: '#FFFFFF',
  danger: '#E5372B',
  success: '#2E9D4F',
  warning: '#C77700',
} as const;

export type ThemeColors = { readonly [K in keyof typeof lightColors]: string };
export type ColorName = keyof ThemeColors;

export const darkColors: ThemeColors = {
  background: '#000000',
  backgroundGrouped: '#000000',
  surface: '#1C1C1E',
  surfaceMuted: '#1C1C1E',
  surfacePressed: '#2C2C2E',
  text: '#FFFFFF',
  textSecondary: '#AEAEB2',
  textTertiary: '#636366',
  border: '#38383A',
  primary: brand.dark,
  onPrimary: '#FFFFFF',
  danger: '#FF5A4F',
  success: '#3DD16B',
  warning: '#FFB340',
};

/** 4pt spacing scale. Use for padding, margin and gap. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

/** Max width for readable content on tablets / large screens. */
export const maxContentWidth = 720;

export const fonts = Platform.select({
  ios: { sans: 'System', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'sans-serif', rounded: 'sans-serif', mono: 'monospace' },
});

/**
 * Type scale, loosely following Apple's HIG text styles (they read well on Android too).
 * Use via `<Text variant="headline">` rather than styling text by hand.
 */
export const typography = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  mono: { fontSize: 13, lineHeight: 18, fontWeight: '400', fontFamily: fonts.mono },
  /** Transport clock (elapsed / position). Monospaced so digits don't jitter. */
  timecode: { fontSize: 40, lineHeight: 48, fontWeight: '600', fontFamily: fonts.mono },
} as const satisfies Record<
  string,
  {
    fontSize: number;
    lineHeight: number;
    fontWeight: '400' | '500' | '600' | '700';
    fontFamily?: string;
  }
>;

export type TypographyVariant = keyof typeof typography;
