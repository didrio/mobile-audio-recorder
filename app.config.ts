/**
 * Dynamic app config, layered on top of the static `app.json`.
 *
 * - `app.json` holds the app's identity and static settings. Edit it for name, bundle ID, icons,
 *   plugins, permissions… CLI tools (`eas init`, `eas update:configure`, `npx expo install`)
 *   write there too, which works because this file passes `config` through.
 * - This file only derives per-variant values so dev, preview and production builds can be
 *   installed side by side on one device, each with its own name, bundle ID and URL scheme.
 *   Dev and preview also get their own icon (black, red dot, "DEV" / "PREVIEW" label in
 *   `assets/images/variants/`), so they're easy to tell apart on the home screen; production
 *   uses the icons in `app.json`. Icons are native: a change needs a new build, not an OTA update.
 *
 * The variant comes from the APP_VARIANT env var: the npm scripts set it for local work and
 * eas.json sets it for cloud builds. Unset means `production` (the safe default for `eas update`).
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

const VARIANTS = {
  development: { nameSuffix: ' Dev', idSuffix: '.dev', schemeSuffix: '-dev', icons: 'dev' },
  preview: {
    nameSuffix: ' Preview',
    idSuffix: '.preview',
    schemeSuffix: '-preview',
    icons: 'preview',
  },
  production: { nameSuffix: '', idSuffix: '', schemeSuffix: '', icons: null },
} as const;

/** The labelled dev/preview icons for every platform slot. */
function variantIcons(key: string) {
  const dir = './assets/images/variants';
  return {
    icon: `${dir}/icon-${key}.png`,
    adaptiveIcon: {
      backgroundColor: '#000000',
      foregroundImage: `${dir}/android-foreground-${key}.png`,
      monochromeImage: `${dir}/android-monochrome-${key}.png`,
    },
  };
}

type AppVariant = keyof typeof VARIANTS;

function isVariant(value: string): value is AppVariant {
  return Object.hasOwn(VARIANTS, value);
}

function getVariant(): AppVariant {
  const value = process.env.APP_VARIANT || 'production';
  if (!isVariant(value)) {
    throw new Error(
      `Unknown APP_VARIANT "${value}". Expected one of: ${Object.keys(VARIANTS).join(', ')}.`,
    );
  }
  return value;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = getVariant();
  const { nameSuffix, idSuffix, schemeSuffix, icons } = VARIANTS[variant];
  const { name, slug, scheme, ios, android } = config;

  if (!name || !slug || typeof scheme !== 'string' || !ios?.bundleIdentifier || !android?.package) {
    throw new Error(
      'app.json must define expo.name, expo.slug, expo.scheme, expo.ios.bundleIdentifier and expo.android.package.',
    );
  }

  const variantIcon = icons ? variantIcons(icons) : null;
  return {
    ...config,
    name: `${name}${nameSuffix}`,
    slug,
    scheme: `${scheme}${schemeSuffix}`,
    ...(variantIcon && { icon: variantIcon.icon }),
    ios: {
      ...ios,
      bundleIdentifier: `${ios.bundleIdentifier}${idSuffix}`,
      ...(variantIcon && { icon: variantIcon.icon }),
    },
    android: {
      ...android,
      package: `${android.package}${idSuffix}`,
      ...(variantIcon && { adaptiveIcon: variantIcon.adaptiveIcon }),
    },
    extra: { ...config.extra, appVariant: variant },
  };
};
