/**
 * Global test setup. Mocks here replace native modules that don't exist in Jest.
 * Prefer mocking at this boundary (native modules, network) over mocking our own code.
 */

// In-memory replacement for the SQLite-backed key-value store used by `@/lib/storage`.
jest.mock('expo-sqlite/kv-store', () => {
  const data = new Map<string, string>();
  const Storage = {
    getItemSync: (key: string) => data.get(key) ?? null,
    setItemSync: (key: string, value: string | ((prev: string | null) => string)) => {
      data.set(key, typeof value === 'function' ? value(data.get(key) ?? null) : value);
    },
    removeItemSync: (key: string) => data.delete(key),
    getAllKeysSync: () => [...data.keys()],
    clearSync: () => {
      data.clear();
      return true;
    },
  };
  return { __esModule: true, Storage, AsyncStorage: Storage, default: Storage };
});

// Haptics are fire-and-forget side effects; make them no-ops in tests.
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// The audio engine's native module: the library ships its own Jest mock.
jest.mock('react-native-audio-api', () => require('react-native-audio-api/mock'));

// expo-crypto's native UUID generator isn't available in Jest; produce unique, valid-looking IDs.
jest.mock('expo-crypto', () => {
  let counter = 0;
  return {
    randomUUID: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
  };
});

jest.mock('react-native-worklets', () => ({
  runOnUISync: (worklet: (...args: unknown[]) => unknown, ...args: unknown[]) => worklet(...args),
}));

// Reanimated runs worklets on the UI thread, which doesn't exist in Jest (its bundled mock still
// initialises the native module in v4). Minimal stand-ins for the hooks the app uses: shared values
// hold plain values, frame callbacks and reactions never fire, animated styles are computed once and
// `Animated.View` is a plain View.
jest.mock('react-native-reanimated', () => {
  const { useState } = require('react');
  const makeSharedValue = (initial: unknown) => {
    let current = initial;
    return {
      get: () => current,
      set: (next: unknown) => {
        current = typeof next === 'function' ? next(current) : next;
      },
      modify: (modifier: (value: unknown) => unknown) => {
        current = modifier(current);
      },
      get value() {
        return current;
      },
      set value(next: unknown) {
        current = next;
      },
    };
  };
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: { View },
    useAnimatedStyle: (compute: () => unknown) => compute(),
    useSharedValue: (initial: unknown) => useState(() => makeSharedValue(initial))[0],
    useDerivedValue: (compute: () => unknown) => makeSharedValue(compute()),
    useFrameCallback: () => ({ setActive: () => {}, isActive: false, callbackId: -1 }),
    useAnimatedReaction: () => {},
    withDecay: () => 0,
    cancelAnimation: () => {},
  };
});
